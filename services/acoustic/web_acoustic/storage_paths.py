from pathlib import Path
from web_acoustic.config import AUDIO_DIR

def resolve_audio_path(path: str | Path) -> Path:
    root = AUDIO_DIR.resolve()
    candidate = Path(path).resolve()
    if candidate == root or not candidate.is_relative_to(root):
        raise ValueError("Audio path must stay inside website audio storage")
    return candidate
