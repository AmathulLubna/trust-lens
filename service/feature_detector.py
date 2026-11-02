"""Shared frozen-XLS-R statistics and a portable, pickle-free linear head."""
import json
from pathlib import Path
import numpy as np
import torch

LAYERS = [4, 8, 12, 16, 20, 24]


def pooled_features(model, batch, layers=LAYERS):
    output = model(**batch, output_hidden_states=True)
    time = output.last_hidden_state.shape[1]
    mask = model._get_feature_vector_attention_mask(time, batch["attention_mask"])
    mask = mask.unsqueeze(-1).float()
    count = mask.sum(1).clamp_min(1)
    features = []
    for layer in layers:
        hidden = output.hidden_states[layer].float()
        mean = (hidden * mask).sum(1) / count
        variance = ((hidden - mean[:, None, :]).square() * mask).sum(1) / count
        features.extend([mean, variance.clamp_min(1e-8).sqrt()])
    return torch.cat(features, dim=1)


class FeatureDetector:
    def __init__(self, path):
        from transformers import AutoFeatureExtractor, AutoModel
        path = Path(path)
        self.spec = json.loads((path / "detector.json").read_text())
        self.extractor = AutoFeatureExtractor.from_pretrained(path, local_files_only=True)
        self.model = AutoModel.from_pretrained(path, local_files_only=True).float().cpu().eval()
        # The selected features do not depend on any later transformer blocks.
        depth = max(self.spec["layers"])
        self.model.encoder.layers = self.model.encoder.layers[:depth]
        self.model.config.num_hidden_layers = depth
        with np.load(path / "linear_head.npz", allow_pickle=False) as head:
            self.weight = head["weight"].copy()
            self.bias = float(head["bias"].item())
        assert self.weight.shape == (len(self.spec["layers"]) * 2 * self.model.config.hidden_size,)
        assert np.isfinite(self.weight).all() and np.isfinite(self.bias)

    def features(self, waveform):
        """Extract the same frozen representation used by the training pipeline."""
        batch = self.extractor(waveform, sampling_rate=16000, return_attention_mask=True,
                               return_tensors="pt", padding=True)
        with torch.inference_mode():
            return pooled_features(self.model, batch, self.spec["layers"]).numpy()[0]

    def score(self, waveform):
        logit = float(self.features(waveform) @ self.weight + self.bias)
        return float(1.0 / (1.0 + np.exp(-np.clip(logit, -60, 60))))
