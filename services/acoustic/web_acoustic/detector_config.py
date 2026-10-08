"""One versioned configuration for serving and offline evaluation."""
import hashlib
import json
import os
import re
from pathlib import Path

DEFAULT_PATH = Path(__file__).resolve().parent.parent / 'config' / 'acoustic-v1.json'

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()

def source_version():
    base=DEFAULT_PATH.parent.parent
    files=['web_acoustic/detector_config.py','web_acoustic/audio_ingress.py',
           'web_acoustic/pipeline/voice_detection.py','web_acoustic/pipeline/transcription.py',
           'web_acoustic/pipeline/local_scam_detector.py']
    hashes={name:hashlib.sha256((base/name).read_bytes()).hexdigest() for name in files}
    return digest(hashes),hashes

def load_config(path=DEFAULT_PATH, overrides=False):
    value = json.loads(Path(path).read_text(encoding='utf-8'))
    if overrides:
        value['model'] = os.environ.get('TRUSTLENS_WEB_SPOOF_MODEL_NAME', value['model'])
        value['revision'] = os.environ.get('TRUSTLENS_WEB_SPOOF_MODEL_REVISION', value['revision'])
    if value.get('schemaVersion') != 1 or value.get('labelMapping') != {'fake': 'synthetic', 'real': 'bona_fide'}:
        raise ValueError('Unsupported detector configuration or label mapping')
    if not re.fullmatch(r'[0-9a-f]{40}', value.get('revision', '')):
        raise ValueError('Acoustic checkpoint must be pinned to a commit')
    if value.get('sampleRate') != 16000 or value.get('aggregation') != 'mean-window-output-v1' or value.get('device') != 'cpu':
        raise ValueError('Unsupported preprocessing, aggregation or device')
    for key in ['windowSec','hopSec','minWindowSec','silenceRms','maxClippedFraction','threshold']:
        if not isinstance(value[key], (int, float)) or not 0 < value[key] <= (30 if key.endswith('Sec') else 1):
            raise ValueError('Invalid detector setting: '+key)
    if not value['minWindowSec'] <= value['hopSec'] <= value['windowSec']:
        raise ValueError('Invalid window spacing')
    if not isinstance(value.get('id'),str) or not re.fullmatch(r'[a-z0-9-]{1,80}',value['id']) or not isinstance(value.get('seed'),int) or not 0<=value['seed']<2**32:
        raise ValueError('Invalid configuration version or seed')
    if value.get('thresholdStatus')!='prototype_uncalibrated':raise ValueError('This configuration has no probability calibration')
    return value

ACTIVE = load_config(os.environ.get('TRUSTLENS_WEB_DETECTOR_CONFIG', str(DEFAULT_PATH)), overrides=True)
CONFIG_HASH = digest(ACTIVE)
