"""Website-only acoustic API; deliberately has no Android case/storage API."""
import asyncio
import logging
import os
import re
import shutil
import time
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv

BASE = Path(__file__).resolve().parent.parent
# Explicit website file only: never discover a parent/mobile project's .env.
load_dotenv(BASE / ".env.web", override=False)
os.environ["HF_HOME"] = str(BASE / ".runtime" / "models" / "huggingface")
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from web_acoustic.routers import analyze, live_demo
from web_acoustic.audio_ingress import BodyLimitMiddleware
from web_acoustic.transport import SecureTransportMiddleware
from web_acoustic.config import AUDIO_DIR, ACOUSTIC_SERVICE_TOKEN
from web_acoustic.pipeline.voice_detection import readiness
from web_acoustic.pipeline import transcription

logging.basicConfig(level=logging.INFO)

def cleanup_expired():
    # Only private website-generated UUID filenames. Never visit another project's storage.
    for path in list(AUDIO_DIR.iterdir())[:1024]:
        if (re.fullmatch(r"[0-9a-f-]{36}(?:_clean|_result)?\.(?:wav|mp3|m4a|ogg|opus|flac|webm|aac|json)", path.name)
                and not path.is_symlink() and path.is_file() and time.time() - path.stat().st_mtime > 3600):
            path.unlink(missing_ok=True)

@asynccontextmanager
async def lifespan(app):
    async def sweep():
        while True:
            cleanup_expired()
            await asyncio.sleep(60)
    if os.environ.get("TRUSTLENS_WEB_WARMUP") == "true":
        try:
            await run_in_threadpool(live_demo.worker.ready)
        except Exception:
            logging.warning("Website acoustic warmup unavailable; no safety conclusion")
    task = asyncio.create_task(sweep())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        live_demo.worker.shutdown()

app = FastAPI(title="TrustLens Website Acoustic Service", lifespan=lifespan)
app.add_middleware(CORSMiddleware,
    allow_origins=os.environ.get("TRUSTLENS_WEB_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:5175").split(","),
    allow_methods=["GET", "POST", "DELETE"], allow_headers=["Authorization", "Content-Type", "X-TrustLens-Owner"])
app.add_middleware(BodyLimitMiddleware)
app.add_middleware(SecureTransportMiddleware)
app.include_router(analyze.router)
app.include_router(live_demo.router)

@app.get("/health")
def health():
    return {"status": "ok", "project": "trustlens-web", "service": "trustlens-web-acoustic-v1"}

@app.get("/ready")
def ready():
    info = live_demo.worker.info or {}
    result = {"project": "trustlens-web", "acoustic": info.get("acoustic", readiness()),
              "asrLoaded": info.get("asrLoaded", transcription._whisper_model is not None),
              "decoderAvailable": bool(shutil.which("ffmpeg") and shutil.which("ffprobe")),
              "authenticationConfigured": bool(ACOUSTIC_SERVICE_TOKEN)}
    result["ready"] = bool(result["acoustic"]["loaded"] and result["asrLoaded"] and result["decoderAvailable"] and result["authenticationConfigured"])
    return JSONResponse(result, status_code=200 if result["ready"] else 503)
