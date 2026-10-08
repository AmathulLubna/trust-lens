"""Single warm local worker. Bounded jobs; no stdout except protocol JSON."""
import json, sys, threading
from pathlib import Path
from web_acoustic.pipeline.voice_detection import _try_load_model, readiness
from web_acoustic.pipeline.transcription import _load_model
from web_acoustic.pipeline import transcription
from web_acoustic.routers.analyze import analyze_file
from web_acoustic.worker_deadline import arm_deadline

boot=arm_deadline(60)
_try_load_model();_load_model();boot.cancel()
print(json.dumps({'ready':True,'acoustic':readiness(),'asrLoaded':transcription._whisper_model is not None}),flush=True)
for text in sys.stdin:
    if len(text)>4096:break
    job=json.loads(text);deadline=arm_deadline(40)
    try:
        result=analyze_file(Path(job['raw']),Path(job['clean']),job['language'],max_duration=4.5,parallel=True)
        print(json.dumps({'id':job['id'],'result':result},allow_nan=False),flush=True)
    except Exception as error:
        print(json.dumps({'id':job['id'],'error':getattr(error,'status_code',503)}),flush=True)
    finally:deadline.cancel()
