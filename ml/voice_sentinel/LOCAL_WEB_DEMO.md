# TrustLens local voice demo

## Open it on this laptop

Double-click `Start-VoiceSentinel.cmd` in the repository root. It opens
the standalone pairing page at <http://127.0.0.1:8765/pair>.
Keep the service window open while testing. Click **Copy pairing key**.
TrustLens runs separately at <http://127.0.0.1:5173> using `Start-TrustLens.cmd`.
In **Upload Check → Local voice model (optional)**, paste the copied key into
**Pairing key from your laptop**, click **Connect local detector**, wait for **ready**, select an audio file or
record the microphone, then click **Analyze recording**. v4 is the default;
v5 is an optional research candidate. Recordings must be 1–120 seconds and at
most 20 MB. Microphone recording stops at 120 seconds; analysis starts only
when you click Analyze.

If the service is already running, the launcher just opens its page. A first
model load can take a few minutes on this laptop and is much slower than subsequent checks. Cancel stops between inference
windows; the current CPU window may need to finish. The service accepts one
running job and one queued job. Switching model on the same audio reuses the
encoder features for up to 15 minutes, avoiding another expensive forward pass.

The older Streamlit demo remains at <http://127.0.0.1:8501/> when it is running.
It is separate from the TrustLens web integration.

## Use with the hosted site after deployment

The updated frontend puts the detector in the existing **Upload Check** section,
alongside the existing **Transcript & scam check**. `/voice` is a shortcut into
the dashboard. Hosted account authentication remains in place; the local preview
shows the same eight navigation options without accessing cloud records.
The existing deployed site will not gain these changes until this code
is approved, pushed, and deployed.

1. Start the companion on the **same computer as the browser**.
2. Open <http://127.0.0.1:8765/pair> and click **Copy pairing key**. This page needs no sign-in or React build.
3. Sign in to TrustLens, open **Upload Check → Local voice model (optional)**, paste the key, and connect.
4. Allow Local network access if Chrome asks. No tunnel or paid hosting is needed.

The key lives only in the current tab's React state and changes on service restart.
Reloading a hosted tab requires pairing again. The hosted website's audio requests
go directly to `http://127.0.0.1:8765`, not to Vercel, Groq or Convex. This works
only while the companion is running on that computer; it is not an online backend
for other people's devices. Browser policies can block local network access;
use the local page if a managed browser disallows it.

Chrome documents permission-gated public-to-local requests and mixed-content
handling here: <https://developer.chrome.com/blog/local-network-access>.
The backend accepts the exact production origin above plus the documented local
development origins; arbitrary Vercel preview domains are deliberately excluded.

## Setup and development

The existing `.local/voice-sentinel-venv` and downloaded model files are required.
They are not committed. For a fresh environment, use Python 3.12 and install:

```powershell
py -3.12 -m venv .local/voice-sentinel-venv
.local/voice-sentinel-venv/Scripts/python.exe -m pip install -r ml/voice_sentinel/requirements.txt -r ml/voice_sentinel/requirements-local.txt
npm ci
npm run build
.\Start-VoiceSentinel.cmd
```

Place the existing trained exports (including config, preprocessing, detector,
operating point, head, and encoder weights) in:

* `ml/voice_sentinel/downloads/v4-augmented/VoiceSentinel_Model`
* `ml/voice_sentinel/downloads/v5/VoiceSentinel_v5/VoiceSentinel_Model` (optional)

v4 is required. v5 uses the same encoder only after startup verifies the actual
weight hashes and feature configuration. A missing/incompatible export yields a
visible startup error rather than a fabricated prediction. No automatic model
downloads run during inference.

`npm run dev` serves TrustLens on port 5173; paste the companion key there as on
the hosted site. Its port is strict: a second launcher reports that port 5173 is
occupied instead of silently switching ports. The companion API uses port 8765;
the older Streamlit demo uses port 8501. The local model itself needs no cloud
provider key. TrustLens account features use the configured Convex backend.
Live Guard and the hosted transcript check do not need a laptop pairing key.

Backend-only command (one worker; bind loopback):

```powershell
.local/voice-sentinel-venv/Scripts/python.exe -m uvicorn local_service:app --app-dir ml/voice_sentinel --host 127.0.0.1 --port 8765 --no-access-log
```

Checks:

```powershell
npm run build
npm test -- --run tests/local-voice.test.tsx
.local/voice-sentinel-venv/Scripts/python.exe -m unittest discover -s ml/voice_sentinel -p test_local_service.py -v
```

## Interpretation and privacy

Both models remain experimental. Scores are uncalibrated values, not probabilities.
The UI keeps the result inconclusive and reports the experimental model vote
separately. v4 worked better on the user's small local examples; this is not an
independent generalization claim. v5 still misses compressed synthetic speech.
Long recordings average six-second window scores and remain unvalidated.
Neither a human-like result nor an AI-like result establishes identity or scam risk.

v5 includes MLAAD-derived training and is restricted to noncommercial research/demo
use by that dataset's terms. This integration introduces no paid service. Review
all model/data licenses before any commercial release.

Pairing and origin checks protect the local API; it binds only to loopback, validates
Host, and does not expose a cloud tunnel. Uploaded audio is held for the bounded
job, decoded in a temporary directory, and deleted from that directory immediately
after decoding. File names are not sent to the backend. At most 16 derived feature
entries and 64 job records are kept in memory; completed records and features
expire after about 15 minutes. In connected TrustLens, **Add to ledger** saves
only the result and model details. AI-like votes also offer **Add to ledger &
alert circle** for enabled circle email contacts; this requires configured email
delivery. Nothing is archived or sent automatically by the local check. Raw audio
and pairing keys stay on the laptop. The saved assessment remains inconclusive.
The browser retains the selected recording until it is replaced or the tab closes.

## Git handoff

Work is on local branch `aniru/local-voice-integration`. Do not push until the user
has tested and approved it. The workspace already contained unrelated edits and
deletions; do not use `git add .`. Stage only the integration files after reviewing
the diff. Keep `.local`, model weights, downloads, private recordings and evaluation
manifests out of GitHub.
