"""Bound bytes before multipart parsing; decode locally with finite limits."""
import asyncio
import json
import subprocess
import uuid
import threading
from web_acoustic.storage_paths import resolve_audio_path
from pathlib import Path
import numpy as np
import soundfile as sf
from fastapi import HTTPException, UploadFile
from web_acoustic.config import AUDIO_DIR, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS
from web_acoustic.detector_config import ACTIVE

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".opus", ".flac", ".webm", ".aac"}
ALLOWED_DEMUXERS = {"wav", "mp3", "mov,mp4,m4a,3gp,3g2,mj2", "ogg", "flac", "matroska,webm", "aac"}

class BodyLimitMiddleware:
    def __init__(self, app):
        self.app = app
        self.active = 0
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "POST":
            return await self.app(scope, receive, send)
        from web_acoustic.security import service_owner
        headers = dict(scope.get("headers", []))
        try:
            service_owner(authorization=headers.get(b"authorization",b"").decode(), x_trustlens_owner=headers.get(b"x-trustlens-owner",b"").decode())
        except HTTPException as error:
            return await self.reject(send,error.status_code)
        # Admission covers body buffering as well as inference. No waiting queue.
        if self.active >= 2:
            return await self.reject(send, 429)
        self.active += 1
        try:
            # Spool the bounded request before a multipart parser allocates anything.
            # No disk/audio remains on malformed requests.
            chunks = []
            size = 0
            deadline = asyncio.get_running_loop().time() + 30
            while True:
                try:
                    message = await asyncio.wait_for(receive(), min(15, max(0.01, deadline - asyncio.get_running_loop().time())))
                except asyncio.TimeoutError:
                    return await self.reject(send, 408)
                if message["type"] == "http.disconnect":
                    return
                if asyncio.get_running_loop().time() >= deadline:
                    return await self.reject(send, 408)
                size += len(message.get("body", b""))
                limit = (2*1024*1024 if scope.get('path','').startswith('/demo/') and scope.get('path','').endswith('/segments')
                         else 65536 if scope.get('path','').startswith('/demo/') else MAX_AUDIO_BYTES + 65536)
                if size > limit:
                    return await self.reject(send, 413)
                chunks.append(message)
                if not message.get("more_body", False):
                    break
            index = 0
            async def replay():
                nonlocal index
                if index < len(chunks):
                    item = chunks[index]; index += 1
                    return item
                return {"type": "http.request", "body": b"", "more_body": False}
            await self.app(scope, replay, send)
        finally:
            self.active -= 1
    async def reject(self, send, status):
        await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": json.dumps({"detail": {401: "Not authenticated", 503: "Service not configured", 413: "Upload too large", 408: "Upload timed out", 429: "Service busy; retry later"}.get(status, "Upload rejected")}).encode()})

async def save_upload(audio: UploadFile):
    ext = Path(audio.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, "Unsupported audio format")
    path = resolve_audio_path(AUDIO_DIR / (str(uuid.uuid4()) + ext))
    size = 0
    try:
        with path.open("xb") as target:
            while True:
                chunk = await audio.read(65536)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_AUDIO_BYTES:
                    raise HTTPException(413, "Audio exceeds 18 MiB")
                target.write(chunk)
        if not size:
            raise HTTPException(400, "Empty audio")
        return path
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    finally:
        await audio.close()

def decode_audio(raw_path: Path, clean_path: Path):
    try:
        result = subprocess.run(["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe",
                                 "-show_entries", "format=format_name,duration:stream=codec_type,duration",
                                 "-of", "json", str(raw_path)], capture_output=True, timeout=10, check=True)
        meta = json.loads(result.stdout)
        if meta.get("format", {}).get("format_name") not in ALLOWED_DEMUXERS:
            raise ValueError("Unsupported audio container")
        if not any(s.get("codec_type") == "audio" for s in meta.get("streams", [])):
            raise ValueError("No audio stream")
        # Unknown duration is bounded by decoding just one second beyond the cap.
        durations = [float(v) for v in [meta.get("format", {}).get("duration")] if v not in (None, "N/A")]
        if durations and max(durations) > MAX_AUDIO_SECONDS:
            raise HTTPException(413, "Audio exceeds five minutes")
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe",
                        "-i", str(raw_path), "-map", "0:a:0", "-t", str(MAX_AUDIO_SECONDS + 1),
                        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-y", str(clean_path)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20, check=True)
        y, sr = sf.read(clean_path, dtype="float32")
        duration = len(y) / sr
        if duration > MAX_AUDIO_SECONDS:
            raise HTTPException(413, "Decoded audio exceeds five minutes")
        if not len(y) or not np.isfinite(y).all():
            raise ValueError("No finite decoded audio")
        rms = float(np.sqrt(np.mean(y*y)))
        clipped = float(np.mean(np.abs(y) >= .999))
        status = "insufficient" if duration < ACTIVE['minWindowSec'] or rms < ACTIVE['silenceRms'] else "reduced" if clipped > ACTIVE['maxClippedFraction'] else "usable"
        return {"status": status, "durationSec": duration, "rms": rms, "clippedFraction": clipped}
    except HTTPException:
        raise
    except FileNotFoundError:
        raise HTTPException(503, "Install ffmpeg and ffprobe on the acoustic service")
    except subprocess.TimeoutExpired:
        raise HTTPException(422, "Audio decoder timed out")
    except Exception:
        raise HTTPException(422, "Malformed or unsupported audio")
