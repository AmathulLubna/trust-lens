# Website-only acoustic service

This service belongs to `D:\trust-lens-main` and has no dependency on the app backend directory. Core server dependencies are installed separately from optional acoustic/ASR libraries. All scores are uncalibrated; no accuracy claim is made.

## Setup (Python 3.12)

From `D:\trust-lens-main`:

```powershell
py -3.12 -m venv services/acoustic/.venv
.\services\acoustic\.venv\Scripts\python.exe -m pip install -r services/acoustic/requirements-ml.txt
```

On this laptop, a standalone Python 3.12 runtime was found at `C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe` and used to create the **new website-only** environment. That is an interpreter, not the app backend's environment.

Create `services/acoustic/.env.web` only if absent, using `.env.web.example` as a guide. Supply a **new** `TRUSTLENS_WEB_SERVICE_TOKEN`; do not copy app credentials. It must match `ACOUSTIC_SERVICE_TOKEN` in the **website's** Convex server configuration. Configure the actual website origins with `TRUSTLENS_WEB_ORIGINS`. Do not expose that token in browser variables. Keep controlled demo disabled unless separately provisioning participant/verifier credentials.

```powershell
npm run service:web
```

API: `http://127.0.0.1:8876`. `/health` identifies this website service; `/ready` returns uncertainty until the models, decoder and service authentication are actually available. Inference loads lazily inside bounded subprocesses. Optionally set `TRUSTLENS_WEB_WARMUP=true` to start the bounded warm model worker at startup; readiness then reports its actual loaded components. No readiness value establishes accuracy. `/demo/ready` checks the optional warm live worker after that demo is explicitly configured. No app jobs or database starts.

## Actual prerequisites and limits

- ffmpeg and ffprobe on PATH for audio decoding.
- Optional ML libraries from `requirements-ml.txt` and a public pinned acoustic checkpoint (`config/acoustic-v1.json`, revision `de3cde5a29c449bb5268814e421b46bf6ebdcd72`) plus the configured faster-whisper checkpoint in this website's own `.runtime/models` cache. Installing only core requirements leaves acoustic/ASR analysis unavailable. Existing app model files are not copied.
- Hosted Convex cannot reach laptop localhost. Real website uploads need an operator-provided reachable HTTPS endpoint with the website service token. No deployment/tunnel was created by this separation.
- At most two admitted uploads; authenticated body bound of 18 MiB plus multipart overhead, decoded container verification and five-minute duration bound. Temporary audio is deleted after processing; narrowly scoped website-only orphan cleanup runs during service lifespan. Worker and decoder timeouts yield unavailable evidence.
- Controlled WebRTC demo uses separate `TRUSTLENS_WEB_USER_TOKEN_HASHES` and `TRUSTLENS_WEB_DEMO_VERIFIERS` values. It is disabled by default. TURN requires separately provisioned infrastructure; no relay is implicitly selected. No real alerts/payments or caller verification are performed.

## Regression checks

```powershell
cd D:\trust-lens-main\services\acoustic
.\.venv\Scripts\python.exe -m pip install -r requirements-test.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_web_only.py -v
.\.venv\Scripts\python.exe -m pip check
```

Tests use generated WAVs and labeled model fixtures. They verify project boundaries, app-credential rejection, decoder/size/duration limits, explicit silence/failure states, raw score preservation, worker paths and deletion. They do not establish model accuracy or test a deployed Convex service. Model files, `.env.web`, runtime files and `.venv` stay ignored.
