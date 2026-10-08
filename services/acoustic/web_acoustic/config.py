import os
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / ".runtime" / "storage"
AUDIO_DIR = STORAGE_DIR / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
ACOUSTIC_SERVICE_TOKEN = os.environ.get("TRUSTLENS_WEB_SERVICE_TOKEN", "")
MAX_AUDIO_BYTES = 18 * 1024 * 1024
MAX_AUDIO_SECONDS = 300
WHISPER_MODEL_SIZE = os.environ.get("TRUSTLENS_WEB_WHISPER_MODEL_SIZE", "tiny")
WHISPER_DEVICE = "cpu"
WHISPER_COMPUTE_TYPE = "int8"
MODEL_CACHE = BASE_DIR / ".runtime" / "models"
