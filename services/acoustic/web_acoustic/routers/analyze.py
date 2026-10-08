import threading
import uuid
import json
import os
import subprocess
import sys
import time
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from web_acoustic.audio_ingress import save_upload, decode_audio
from web_acoustic.config import AUDIO_DIR, BASE_DIR
from web_acoustic.storage_paths import resolve_audio_path
from web_acoustic.security import service_owner
from web_acoustic.pipeline.voice_detection import detect_synthetic_voice
from web_acoustic.pipeline.transcription import transcribe_audio
from starlette.concurrency import run_in_threadpool

router = APIRouter(tags=["web-acoustic"])
_admission = threading.BoundedSemaphore(2)

def bounded_analyze(raw, clean, language):
    output = resolve_audio_path(AUDIO_DIR / (str(uuid.uuid4()) + "_result.json"))
    process = None
    try:
        process = subprocess.Popen([sys.executable, "-m", "web_acoustic.worker_analyze", str(raw), str(clean), str(output), language],
            cwd=BASE_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        try:
            process.wait(timeout=55)
        except subprocess.TimeoutExpired:
            raise HTTPException(503, "Acoustic analysis exceeded its deadline; no safety conclusion is available")
        if process.returncode or not output.is_file() or output.stat().st_size > 256000:
            raise HTTPException(503, "Acoustic worker unavailable")
        result = json.loads(output.read_text(encoding="utf-8"))
        if "error" in result:
            raise HTTPException(result["error"]["status"], result["error"]["detail"])
        return result
    finally:
        if process and process.poll() is None:
            process.kill()
            process.wait(timeout=10)
        output.unlink(missing_ok=True)

def analyze_file(raw, clean, language, max_duration=300, parallel=False):
    started = time.perf_counter()
    quality = decode_audio(raw, clean)
    decoded = time.perf_counter()
    if quality['durationSec'] > max_duration:
        raise HTTPException(413, 'Decoded window exceeds permitted duration')
    if quality["status"] == "insufficient":
        return {"acoustic": {"status": "insufficient_audio", "score": None, "models": [], "windows": 0},
                "reliability": quality, "transcript": None, "contextStatus": "insufficient_audio",
                "timingsMs": {"decode": (decoded-started)*1000, "acoustic": 0, "asr": 0, "total": (decoded-started)*1000}}
    def timed(callback):
        before=time.perf_counter();value=callback();return value,(time.perf_counter()-before)*1000
    if parallel:
        # Two independent signals, at most two CPU tasks in one bounded worker.
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=2) as pool:
            acoustic_future=pool.submit(timed,lambda:detect_synthetic_voice(str(clean)))
            context_future=pool.submit(timed,lambda:transcribe_audio(str(clean),language=language))
            voice,acoustic_ms=acoustic_future.result();transcript,asr_ms=context_future.result()
    else:
        voice,acoustic_ms=timed(lambda:detect_synthetic_voice(str(clean)))
        transcript,asr_ms=timed(lambda:transcribe_audio(str(clean),language=language))
    # Bad clipping gates the result, never becomes an authenticity conclusion.
    if quality["status"] == "reduced":
        voice = {**voice, "status": "inconclusive", "synthetic_probability": None}
    done = time.perf_counter()
    return {"acoustic": {"status": voice["status"], "score": voice["synthetic_probability"],
                         "models": voice.get("models_used", []), "windows": voice.get("windows_analyzed", 0),
                         "revision": voice.get("revision"), "aggregation": voice.get("aggregation", "none"), "configHash": voice.get("configHash")},
            "reliability": quality, "transcript": transcript,
            "contextStatus": "available" if transcript else "analysis_unavailable",
            "timingsMs": {"decode": (decoded-started)*1000, "acoustic": acoustic_ms,
                          "asr": asr_ms, "total": (done-started)*1000}}

@router.post("/analyze")
async def analyze(audio: UploadFile = File(...), language: str = Form("auto"), owner: str = Depends(service_owner)):
    if language not in {"auto", "hi", "en"}:
        raise HTTPException(400, "Unsupported transcription language")
    if not _admission.acquire(blocking=False):
        raise HTTPException(429, "Acoustic service busy; retry later")
    raw = None
    clean = resolve_audio_path(AUDIO_DIR / (str(uuid.uuid4()) + "_clean.wav"))
    try:
        raw = await save_upload(audio)
        result = await run_in_threadpool(bounded_analyze, raw, clean, language)
        return {"service": "trustlens-web-acoustic-v1", **result}
    finally:
        # Cleanup is part of completion; failure cannot be silently acknowledged.
        try:
            if raw:
                raw.unlink(missing_ok=True)
            clean.unlink(missing_ok=True)
        finally:
            _admission.release()
