"""Convex-facing gateway; all inference/jobs remain in the existing service.

Run through launch.py. Never tunnel the original service's pairing/frontend API.
"""
from collections import OrderedDict, deque
from contextlib import asynccontextmanager
import os
from pathlib import Path
import re
import secrets
import sys
import threading
import time

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml" / "voice_sentinel"))
from local_service import create_app, TTL  # noqa: E402

MAX_BYTES = 3 * 1024 * 1024  # Base64 + metadata must fit a Convex Node action.
MAX_USERS = 1024
JOB_ID = re.compile(r"jobs/[A-Za-z0-9_-]{1,64}\Z")
USER_ID = re.compile(r"[A-Za-z0-9:_-]{1,128}\Z")


def create_gateway(engine=None, secret=None):
    secret = secret or os.environ.get("TL_MODEL_SERVICE_SECRET", "")
    if len(secret) < 32 or not secret.isascii() or any(c.isspace() for c in secret):
        raise RuntimeError("Set a random TL_MODEL_SERVICE_SECRET of at least 32 ASCII characters, or use launch.py.")
    backend = create_app(engine=engine)
    owners = OrderedDict()
    rates = {}
    uploads = threading.BoundedSemaphore(2)

    @asynccontextmanager
    async def lifespan(app):
        # Reuse startup, the single inference worker, queue, expiry, and shutdown.
        async with backend.router.lifespan_context(backend):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=backend),
                base_url="http://127.0.0.1:8765", trust_env=False,
            ) as client:
                response = await client.get("/api/voice/pairing", headers={"Sec-Fetch-Site": "same-origin"})
                response.raise_for_status()
                # This internal session token never leaves this process.
                app.state.internal_headers = {"X-TrustLens-Key": response.json()["key"]}
                app.state.backend = client
                yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def protect(request, call_next):
        supplied = request.headers.get("authorization", "").encode()
        if not secrets.compare_digest(supplied, ("Bearer " + secret).encode()):
            response = JSONResponse({"detail": "Unauthorized service request."}, status_code=401)
        elif request.headers.get("origin"):
            response = JSONResponse({"detail": "Use the authenticated Convex backend."}, status_code=403)
        elif not USER_ID.fullmatch(request.headers.get("x-trustlens-user", "")):
            response = JSONResponse({"detail": "A verified user is required."}, status_code=403)
        else:
            response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    @app.api_route("/api/voice/{path:path}", methods=["GET", "POST", "DELETE"])
    async def forward(path: str, request: Request):
        user = request.headers["x-trustlens-user"]
        now = time.monotonic()
        for key in list(owners):
            if now - owners[key][1] > TTL:
                del owners[key]
        for key in list(rates):
            if now - rates[key]["updated"] > 60:
                del rates[key]

        submit = path == "jobs" and request.method == "POST"
        job = JOB_ID.fullmatch(path)
        if not (submit or (path in ("health", "session") and request.method == "GET")
                or (job and request.method in ("GET", "DELETE"))):
            return JSONResponse({"detail": "Endpoint not available."}, status_code=404)
        if job and owners.get(path.split("/")[1], (None,))[0] != user:
            return JSONResponse({"detail": "Check not found or expired."}, status_code=404)
        if user not in rates:
            if len(rates) >= MAX_USERS:
                return JSONResponse({"detail": "Service is busy. Retry in a minute."}, status_code=429)
            rates[user] = {"updated": now, "submit": deque(), "read": deque()}
        rate = rates[user]
        rate["updated"] = now
        events = rate["submit" if submit else "read"]
        while events and now - events[0] >= 60:
            events.popleft()
        # Allow one six-second live stream plus a small retry/upload margin.
        if len(events) >= (12 if submit else 180):
            return JSONResponse({"detail": "Check limit reached. Retry in a minute."}, status_code=429)
        events.append(now)

        raw = bytearray()
        if submit:
            model = request.query_params.get("model", "v4")
            if model not in ("v4", "v5"):
                return JSONResponse({"detail": "Unknown model."}, status_code=400)
            if not uploads.acquire(blocking=False):
                return JSONResponse({"detail": "Too many simultaneous uploads."}, status_code=429)
            try:
                async for chunk in request.stream():
                    if len(raw) + len(chunk) > MAX_BYTES:
                        return JSONResponse({"detail": "Audio must be no larger than 3 MiB."}, status_code=413)
                    raw.extend(chunk)
                response = await app.state.backend.post(
                    "/api/voice/jobs", params={"model": model}, content=bytes(raw),
                    headers=app.state.internal_headers,
                )
            finally:
                uploads.release()
        else:
            response = await app.state.backend.request(
                request.method, "/api/voice/" + path, headers=app.state.internal_headers,
            )
        data = response.json()
        if submit and response.status_code == 202:
            owners[data["id"]] = (user, now)
            while len(owners) > 64:
                owners.popitem(last=False)
        if path == "session" and response.is_success:
            data = {"connected": True}
        return JSONResponse(data, status_code=response.status_code)

    return app
