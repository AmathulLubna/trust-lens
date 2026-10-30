"""Loopback-only companion for TrustLens. Run with launch_local.py."""
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import hashlib
import json
import logging
from pathlib import Path
import secrets
import subprocess
import tempfile
import threading
import time

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
MODEL_PATHS = {
    "v4": HERE / "downloads/v4-augmented/VoiceSentinel_Model",
    "v5": HERE / "downloads/v5/VoiceSentinel_v5/VoiceSentinel_Model",
}
LOCAL_ORIGINS = {"http://127.0.0.1:8765", "http://localhost:8765"}
ORIGINS = LOCAL_ORIGINS | {"https://trustlens-vmeg.vercel.app", "http://localhost:5173", "http://127.0.0.1:5173"}
MAX_BYTES = 20 * 1024 * 1024
MAX_SECONDS = 120
TTL = 15 * 60


def decode_audio(raw):
    """Decode at most 121 seconds; forbid network protocols and playlists."""
    import imageio_ffmpeg
    # An anonymous local name prevents uploaded filenames from affecting commands.
    with tempfile.TemporaryDirectory(prefix="trustlens-audio-") as directory:
        source = Path(directory) / "audio"
        source.write_bytes(raw)
        try:
            result = subprocess.run([
                imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-v", "error",
                "-protocol_whitelist", "file,pipe", "-format_whitelist",
                "mp3,wav,flac,ogg,matroska,webm,mov,mp4,m4a,3gp,3g2,mj2,aac",
                "-i", str(source), "-t", str(MAX_SECONDS + 1),
                "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1",
            ], capture_output=True, timeout=25, check=False,
                creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0)
        except subprocess.TimeoutExpired as exc:
            raise ValueError("Audio decoding timed out. Try a shorter WAV or MP3.") from exc
    if result.returncode or not result.stdout:
        raise ValueError("Cannot decode this recording. Use MP3, WAV, M4A, OGG, FLAC or WebM audio.")
    waveform = np.frombuffer(result.stdout, dtype="<f4").copy()
    if not 16000 <= len(waveform) <= MAX_SECONDS * 16000:
        raise ValueError("Use a recording between 1 and 120 seconds long.")
    if not np.isfinite(waveform).all() or np.sqrt(np.mean(waveform.astype(np.float64) ** 2)) < 1e-5:
        raise ValueError("The recording is silent or invalid. Record audible speech and try again.")
    return waveform


class Engine:
    def __init__(self):
        self.state = "warming"
        self.error = None
        self.models = {}
        self.cache = OrderedDict()
        self.cache_lock = threading.Lock()

    def load(self):
        try:
            import torch
            from feature_detector import FeatureDetector
            torch.set_num_threads(4)
            self.detector = FeatureDetector(MODEL_PATHS["v4"])
            with (MODEL_PATHS["v4"] / "model.safetensors").open("rb") as stream:
                encoder_hash = hashlib.file_digest(stream, "sha256").hexdigest()
            for name, path in MODEL_PATHS.items():
                if not path.is_dir():
                    continue
                spec = json.loads((path / "detector.json").read_text())
                keys = ("layers", "sampling_rate", "max_seconds", "base_model", "base_model_revision")
                if any(spec[k] != self.detector.spec[k] for k in keys):
                    raise ValueError("Model encoders have incompatible preprocessing.")
                with (path / "model.safetensors").open("rb") as stream:
                    if hashlib.file_digest(stream, "sha256").hexdigest() != encoder_hash:
                        raise ValueError("Model encoder weights differ; sharing features would be invalid.")
                with np.load(path / "linear_head.npz", allow_pickle=False) as head:
                    weight, bias = head["weight"].copy(), float(head["bias"].item())
                if weight.shape != self.detector.weight.shape or not np.isfinite(weight).all() or not np.isfinite(bias):
                    raise ValueError("Invalid classifier head.")
                threshold = float(json.loads((path / "operating_point.json").read_text())["threshold"])
                self.models[name] = (weight, bias, threshold)
            self.state = "ready"
        except Exception:
            logging.exception("Local voice model startup failed")
            self.error = "Model startup failed. Check the local service log and model files, then restart."
            self.state = "error"

    def analyze(self, raw, model, progress, cancelled):
        from audio_windows import SR, WINDOW, window_starts, sigmoid
        key = hashlib.sha256(raw).hexdigest()
        with self.cache_lock:
            self._expire_cache()
            cached = self.cache.get(key)
        if cached:
            _, features, duration = cached
        else:
            wave = decode_audio(raw)
            duration = len(wave) / SR
            starts = window_starts(len(wave))
            features = []
            for index, start in enumerate(starts):
                if cancelled.is_set():
                    return None
                features.append(self.detector.features(wave[start:start + WINDOW]))
                progress(index + 1, len(starts))
            features = np.stack(features)
            if cancelled.is_set():
                return None
            with self.cache_lock:
                self.cache[key] = (time.monotonic(), features, duration)
                while len(self.cache) > 16:
                    self.cache.popitem(last=False)
        weight, bias, threshold = self.models[model]
        scores = sigmoid(features @ weight + bias)
        average = float(scores.mean())
        return {"model": model, "score": average, "threshold": threshold,
                "vote": "AI-like" if average >= threshold else "human-like",
                "assessment": "Inconclusive", "seconds": round(duration, 2),
                "windows": len(features), "cached": bool(cached),
                "note": "Experimental model output, not a probability or proof of origin. Both models have unresolved detection errors. Longer recordings average window scores and are not independently validated."}

    def _expire_cache(self):
        for key in list(self.cache):
            if time.monotonic() - self.cache[key][0] > TTL:
                del self.cache[key]

    def cleanup(self):
        with self.cache_lock:
            self._expire_cache()


def create_app(engine=None, dist=None):
    engine = engine or Engine()
    token = secrets.token_urlsafe(32)
    jobs, lock = {}, threading.Lock()
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="voice")
    stop = threading.Event()
    upload_slots = threading.BoundedSemaphore(2)

    def cleanup():
        while not stop.wait(30):
            with lock:
                for key in list(jobs):
                    job = jobs[key]
                    if job["status"] in ("done", "error", "cancelled") and time.monotonic() - job["updated"] > TTL:
                        del jobs[key]
            engine.cleanup()

    @asynccontextmanager
    async def lifespan(_):
        executor.submit(engine.load)
        cleaner = threading.Thread(target=cleanup, daemon=True)
        cleaner.start()
        yield
        stop.set()
        with lock:
            for job in jobs.values():
                job["cancel"].set()
        executor.shutdown(wait=True, cancel_futures=True)

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=sorted(ORIGINS),
                       allow_methods=["GET", "POST", "DELETE"],
                       allow_private_network=True,
                       allow_headers=["Content-Type", "X-TrustLens-Key"])
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])

    @app.middleware("http")
    async def guard(request, call_next):
        origin = request.headers.get("origin")
        if origin and origin not in ORIGINS:
            return JSONResponse({"detail": "Origin not allowed."}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    def authorize(request):
        supplied = request.headers.get("x-trustlens-key", "")
        if not secrets.compare_digest(supplied, token):
            raise HTTPException(401, "Pair this tab with the local service again.")

    @app.get("/api/voice/health")
    def health():
        return {"service": "trustlens-local-voice", "state": engine.state,
                "models": list(engine.models) if engine.state == "ready" else [], "error": engine.error}

    @app.get("/")
    @app.get("/pair")
    def pairing_page():
        # A standalone page works even when the React app requires cloud auth
        # or its built frontend is missing/out of date.
        return FileResponse(HERE / "pairing.html", media_type="text/html")

    @app.get("/api/voice/pairing")
    def pairing(request: Request):
        # Never disclose the key to a remote site, even one allowed to submit audio.
        if request.headers.get("sec-fetch-site") != "same-origin" or str(request.base_url).rstrip("/") not in LOCAL_ORIGINS:
            raise HTTPException(403, "Open the local Voice Check page to get the pairing key.")
        origin = request.headers.get("origin")
        if origin and origin != str(request.base_url).rstrip("/"):
            raise HTTPException(403, "Pair from the local page.")
        return {"key": token}

    @app.get("/api/voice/session")
    def session(request: Request):
        authorize(request)
        return {"paired": True}

    def snapshot(job):
        return {k: v for k, v in job.items() if k not in ("cancel", "updated", "raw")}

    def run(job_id):
        with lock:
            job = jobs[job_id]
            raw = job.pop("raw", b"")
            if job["cancel"].is_set():
                job.update(status="cancelled", updated=time.monotonic())
                return
            job["status"] = "running"
        started = time.monotonic()
        def progress(done, total):
            with lock:
                job.update(completed=done, total=total, updated=time.monotonic())
        try:
            result = engine.analyze(raw, job["model"], progress, job["cancel"])
            with lock:
                if not job["cancel"].is_set():
                    job.update(status="done", result=result, elapsed=round(time.monotonic() - started, 2))
        except Exception as exc:
            logging.exception("Voice analysis failed")
            with lock:
                if not job["cancel"].is_set():
                    job.update(status="error", error=str(exc) if isinstance(exc, ValueError) else "Analysis failed. Check the service log and try a shorter recording.")
        finally:
            with lock:
                if job["cancel"].is_set():
                    job["status"] = "cancelled"
                job["updated"] = time.monotonic()

    @app.post("/api/voice/jobs", status_code=202)
    async def submit(request: Request, model: str = "v4"):
        authorize(request)
        if engine.state != "ready":
            raise HTTPException(503, engine.error or "Model is warming up. Try again shortly.")
        if model not in engine.models:
            raise HTTPException(400, "This model is unavailable.")
        # Raw request body avoids multipart spooling before authentication/size checks.
        if not upload_slots.acquire(blocking=False):
            raise HTTPException(429, "Too many simultaneous uploads.")
        try:
            data = bytearray()
            async for chunk in request.stream():
                if len(data) + len(chunk) > MAX_BYTES:
                    raise HTTPException(413, "Audio must be no larger than 20 MB.")
                data.extend(chunk)
        finally:
            upload_slots.release()
        if not data:
            raise HTTPException(400, "Choose a recording first.")
        with lock:
            if sum(j["status"] in ("queued", "running", "cancelling") for j in jobs.values()) >= 2:
                raise HTTPException(429, "The local detector is busy. Wait for a check to finish.")
            if len(jobs) >= 64:
                # Keep in-memory results bounded even during many cache hits.
                terminal = [k for k, j in jobs.items() if j["status"] in ("done", "error", "cancelled")]
                for key in terminal[:max(1, len(jobs) - 63)]:
                    del jobs[key]
            job_id = secrets.token_urlsafe(18)
            jobs[job_id] = {"id": job_id, "status": "queued", "model": model,
                            "completed": 0, "total": 0, "cancel": threading.Event(),
                            "updated": time.monotonic(), "raw": bytes(data)}
            response = snapshot(jobs[job_id])
        executor.submit(run, job_id)
        return response

    @app.get("/api/voice/jobs/{job_id}")
    def get_job(job_id: str, request: Request):
        authorize(request)
        with lock:
            if job_id not in jobs:
                raise HTTPException(404, "This check expired. Analyze the recording again.")
            return snapshot(jobs[job_id])

    @app.delete("/api/voice/jobs/{job_id}")
    def cancel(job_id: str, request: Request):
        authorize(request)
        with lock:
            if job_id not in jobs:
                raise HTTPException(404, "Check not found.")
            job = jobs[job_id]
            if job["status"] in ("queued", "running"):
                job["cancel"].set()
                job.pop("raw", None)
                job.update(status="cancelling", updated=time.monotonic())
            return snapshot(job)

    dist = Path(dist) if dist else ROOT / "dist"
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}")
    def frontend(path: str):
        if path.startswith("api/") or not (dist / "index.html").is_file():
            raise HTTPException(404, "Build the frontend with npm run build first.")
        candidate = (dist / path).resolve()
        if candidate.is_relative_to(dist.resolve()) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(dist / "index.html")

    return app


app = create_app()
