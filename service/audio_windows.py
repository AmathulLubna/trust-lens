"""Shared recording segmentation for training diagnostics and local inference."""
import numpy as np

SR = 16000
WINDOW = SR * 6


def window_starts(length):
    if length < SR:
        raise ValueError("Use at least one second of audio.")
    starts = list(range(0, max(1, length - WINDOW + 1), WINDOW))
    if starts[-1] + WINDOW < length:
        starts.append(max(0, length - WINDOW))
    return starts


def sigmoid(logits):
    return 1.0 / (1.0 + np.exp(-np.clip(logits, -60, 60)))
