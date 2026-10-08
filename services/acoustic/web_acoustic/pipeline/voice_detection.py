"""Versioned acoustic baseline. Scores are uncalibrated model outputs."""
import logging
import math
import threading
import numpy as np
from web_acoustic.detector_config import ACTIVE, CONFIG_HASH

logger = logging.getLogger("trustlens.voice_detection")
_model_pipelines = {}
_model_load_attempted = False
_model_lock = threading.Lock()
CHUNK_SEC = ACTIVE['windowSec']
HOP_SEC = ACTIVE['hopSec']
MIN_CHUNK_SEC = ACTIVE['minWindowSec']
SILENCE_RMS = ACTIVE['silenceRms']

def _try_load_model():
    global _model_load_attempted
    if _model_load_attempted:
        return
    with _model_lock:
        if _model_load_attempted:
            return
        _model_load_attempted = True
        try:
            import torch
            from transformers import pipeline
            torch.manual_seed(ACTIVE['seed'])
            torch.set_num_threads(2)
            torch.use_deterministic_algorithms(True)
            candidate = pipeline(
                "audio-classification", model=ACTIVE['model'],
                device=-1, revision=ACTIVE['revision'], trust_remote_code=False)
            validate_checkpoint(candidate)
            _model_pipelines[ACTIVE['model']] = candidate
        except Exception:
            logger.warning("Acoustic checkpoint unavailable")

def validate_checkpoint(candidate):
    labels = [str(label).lower() for label in candidate.model.config.id2label.values()]
    if len(labels) != len(ACTIVE['labelMapping']) or set(labels) != set(ACTIVE['labelMapping']):
        raise ValueError('Checkpoint labels do not match the versioned contract')
    if candidate.feature_extractor.sampling_rate != ACTIVE['sampleRate']:
        raise ValueError('Checkpoint sample rate does not match the versioned contract')
    candidate.model.eval()

def _score_to_synthetic_prob(results):
    # Explicit labels used by the configured baseline; LABEL_0 is unknown.
    if len(results)!=len(ACTIVE['labelMapping']):
        raise ValueError('Duplicate or missing acoustic labels')
    mapped = {str(r.get("label", "")).lower(): float(r["score"]) for r in results}
    if set(mapped) != set(ACTIVE['labelMapping']):
        raise ValueError("Unsupported acoustic label taxonomy")
    if any(not math.isfinite(v) or not 0 <= v <= 1 for v in mapped.values()):
        raise ValueError("Invalid acoustic score")
    if abs(sum(mapped.values()) - 1) > .02:
        raise ValueError("Invalid acoustic distribution")
    return mapped["fake"], None  # no invented confidence

def _iter_chunks(y, sr):
    for start in range(0, len(y), int(HOP_SEC * sr)):
        chunk = y[start:start + int(CHUNK_SEC * sr)]
        if len(chunk) >= int(MIN_CHUNK_SEC * sr) and float(np.sqrt(np.mean(chunk ** 2))) >= SILENCE_RMS:
            yield chunk, start / sr

def _model_spoof_score(audio_path, waveform=None):
    import librosa
    y, sr = waveform if waveform is not None else librosa.load(audio_path, sr=ACTIVE['sampleRate'], mono=True)
    chunks = list(_iter_chunks(y, sr))
    if not chunks:
        return _unavailable("insufficient_audio")
    if not _model_pipelines:
        return _unavailable("analysis_unavailable")
    # Use only the selected, explicit baseline. User-trained experimental
    # classifiers are kept in their files but never silently promoted.
    name, model = next(iter(_model_pipelines.items()))
    scores = []
    for chunk, start in chunks:
        score, _ = _score_to_synthetic_prob(model({"array": chunk, "sampling_rate": sr}, top_k=None))
        scores.append({"startSec": start, "durationSec": len(chunk)/sr, "score": score})
    return {"synthetic_probability": float(np.mean([s["score"] for s in scores])),
            "confidence": None, "mode": "model", "status": "available",
            "windows_analyzed": len(scores), "models_used": [name],
            "revision": ACTIVE['revision'], "aggregation": ACTIVE['aggregation'], "configHash": CONFIG_HASH, "window_scores": scores}

def _unavailable(status):
    return {"synthetic_probability": None, "confidence": None, "mode": status,
            "status": status, "windows_analyzed": 0, "models_used": []}

def detect_synthetic_voice(audio_path):
    try:
        import librosa
        # Decode once. Apply these gates even when called outside /analyze.
        y, sr = librosa.load(audio_path, sr=ACTIVE['sampleRate'], mono=True)
        if not np.isfinite(y).all():
            return _unavailable('inconclusive')
        if not list(_iter_chunks(y, sr)):
            return _unavailable("insufficient_audio")
        if float(np.mean(np.abs(y) >= .999)) > ACTIVE['maxClippedFraction']:
            return _unavailable('inconclusive')
        _try_load_model()
        return _model_spoof_score(audio_path, (y, sr))
    except ValueError:
        return _unavailable("inconclusive")
    except Exception:
        logger.warning("Acoustic inference unavailable for this recording")
        return _unavailable("analysis_unavailable")

def readiness():
    return {"loaded": bool(_model_pipelines), "attempted": _model_load_attempted,
            "checkpoint": ACTIVE['model'], "revision": ACTIVE['revision'], "configHash": CONFIG_HASH,
            "labelMapping": ACTIVE['labelMapping'], "calibrated": False, "device": ACTIVE['device']}
