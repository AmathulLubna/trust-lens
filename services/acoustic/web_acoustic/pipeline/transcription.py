import logging
from typing import Optional

logger = logging.getLogger("trustlens.transcription")

_whisper_model = None
_load_attempted = False


def _load_model():
    global _whisper_model, _load_attempted
    if _load_attempted:
        return
    _load_attempted = True
    try:
        from faster_whisper import WhisperModel

        from web_acoustic.config import WHISPER_COMPUTE_TYPE, WHISPER_DEVICE, WHISPER_MODEL_SIZE, MODEL_CACHE

        _whisper_model = WhisperModel(
            WHISPER_MODEL_SIZE, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE, download_root=str(MODEL_CACHE / "whisper")
        )
        logger.info(f"Loaded faster-whisper model: {WHISPER_MODEL_SIZE}")
    except Exception as e:
        logger.warning("Local transcription model unavailable")


def transcribe_audio(audio_path: str, language: str = "auto") -> Optional[str]:
    """
    Returns transcript text, or None if transcription failed/unavailable.
    Callers should treat None as "skip conversation-risk stage" per the spec,
    not as an error.
    """
    _load_model()
    if _whisper_model is None:
        return None
    try:
        segments, _info = _whisper_model.transcribe(audio_path, beam_size=5, language=None if language == "auto" else language, vad_filter=True)
        text = " ".join(seg.text.strip() for seg in segments).strip()
        return text if text else None
    except Exception as e:
        logger.warning("Local transcription failed; no transcript available")
        return None
