# TrustLens — LCU

LCU connects the TrustLens web app to **one operator-hosted VoiceSentinel model**.
Users open the website; they do not install the model, run Python, or enter a
pairing key. Audio travels through the authenticated Convex backend to the
operator's laptop, which returns an experimental voice classification.

```text
User's browser → Convex → HTTPS tunnel → operator's laptop :8766 → VoiceSentinel
```

This branch already includes the integration. **Do not apply
`tl_model_lcu/integration.patch` again.** The patch is retained for reuse in an
older checkout. The new gateway and adapters import the existing service, UI,
hooks and model files; model weights are not copied into the integration folder.
See the [reuse map](tl_model_lcu/README.md#what-is-reused-and-where-to-update-it).

## Requirements

- Node.js 24.15+ within the versions allowed by `package.json`, npm and Git.
- Python 3.12 on the **operator's laptop only**.
- The existing trained v4 export on that laptop, at the path below. v5 is optional.
- Access to the existing TrustLens Convex project and its configured authentication.
- `cloudflared` on the operator's `PATH`, or an existing HTTPS tunnel.

Users' computers need only a current browser. Keep the operator's laptop awake,
online and running the gateway. A single laptop has limited capacity; this setup
is for a limited beta, not thousands of simultaneous live checks.

## Get the branch

For a new checkout:

```powershell
git clone --branch LCU https://github.com/AmathulLubna/trust-lens.git
cd trust-lens
npm ci
```

For this existing checkout, the local environment and trained files can be reused
in place. You do not need another copy of the project or model.

## Run and check it on the existing laptop

Run these commands from the project root. Development and production Convex
are separate deployments; the launcher must configure the one your frontend uses.

1. Connect the existing Convex project if `.env.local` is not already configured:

   ```powershell
   npx convex dev --configure existing
   ```

   Choose the existing TrustLens project. If the command stays running after
   configuration, stop it before the next step so only one Convex dev process runs.

2. Install `cloudflared` if needed. On Windows with WinGet:

   ```powershell
   winget install --id Cloudflare.cloudflared --exact
   ```

   Open a new terminal after installation if `cloudflared --version` is not found.
   [Official installation instructions](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).

3. In **terminal 1**, sync the backend and start the web app:

   ```powershell
   npm run dev:full
   ```

   Open [TrustLens locally](http://127.0.0.1:5173). The port is fixed at 5173.

4. In **terminal 2**, start the model gateway/tunnel and configure development Convex:

   ```powershell
   .\tl_model_lcu\Start.cmd --sync-dev
   ```

   The launcher uses the existing `.local/voice-sentinel-venv` and trained exports,
   creates a private service credential automatically, opens a temporary HTTPS
   tunnel, and sets the two model connection variables in **development** Convex.
   It prints the endpoint, never the service credential. Keep both terminals open.
   Do not also start `Start-VoiceSentinel.cmd`; that is the older per-browser
   pairing companion on port 8765 and is not needed for LCU.

5. Sign in or continue as a guest. Open **Upload Check → Human or AI voice →
   Connect detector**. Wait for **Connected · shared detector ready**, select a
   1–120 second recording no larger than **3 MiB**, and choose **Analyze recording**.
   The result includes the model vote/score and an **Inconclusive** assessment.

6. For microphone checks, open **Live Guard → Live check mode → VoiceSentinel ·
   shared AI voice check**, connect, then choose **Start voice check**. Allow the
   microphone. Speech samples are checked on the operator's laptop; this mode
   does not transcribe or assess scam language. Use the separate cloud option
   for transcript/scam checks.

To check from a second device, use a deployed HTTPS frontend connected to the same
configured Convex deployment. No model, pairing key or local-network permission
is required on that device. The operator's local `127.0.0.1:5173` address is only
accessible on the operator's computer.

## Python and model setup for a fresh operator environment

Skip environment creation when `.local/voice-sentinel-venv` already exists:

```powershell
py -3.12 -m venv .local/voice-sentinel-venv
.\.local\voice-sentinel-venv\Scripts\python.exe -m pip install -r tl_model_lcu/requirements.txt
```

Restore your existing trained export from your local model files or backup to:

```text
ml/voice_sentinel/downloads/v4-augmented/VoiceSentinel_Model/    required
ml/voice_sentinel/downloads/v5/VoiceSentinel_v5/VoiceSentinel_Model/    optional
```

The required export includes `model.safetensors`, `config.json`,
`preprocessor_config.json`, `detector.json`, `linear_head.npz` and
`operating_point.json`. These exports are deliberately **not in GitHub**.
A fresh clone alone cannot run inference without them. Do not replace the trained
export with a generic base model: the feature layers, classifier and operating
threshold must match. The existing engine validates compatible v4/v5 encoders.

## Configuration and keys

| Name | Where it belongs | How it is configured |
| --- | --- | --- |
| `VITE_CONVEX_URL` | Frontend `.env.local` / hosting environment; public | Set by Convex development setup, or use the matching production deployment's cloud URL. |
| `CONVEX_DEPLOYMENT` | Local Convex CLI configuration | Written by `npx convex dev --configure existing`; selects the development project. `--prod` explicitly selects its production deployment. |
| `TL_MODEL_URL` | **Convex backend environment** | Launcher writes the HTTPS tunnel origin when run with `--sync-dev` or `--sync-prod`. |
| `TL_MODEL_SERVICE_SECRET` | **Convex backend and operator's laptop only** | Randomly generated by the launcher, saved in gitignored `tl_model_lcu/runtime/service.json`, supplied to Python, and synced privately to Convex. Users never enter it. |
| `SITE_URL` | Convex backend environment | Frontend origin: local development origin or deployed HTTPS frontend origin. |
| `JWT_PRIVATE_KEY`, `JWKS` | Convex backend environment | Keep the existing Convex Auth configuration. Never put these in browser variables or GitHub. |
| `GROQ_API_KEY` | Convex backend environment; optional for LCU | Needed by the separate hosted transcript/scam features, not VoiceSentinel classification. |
| `OTP_EMAIL_API_KEY` | Convex backend environment; optional | Email OTP sign-in. Existing guest sign-in is available. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Convex backend environment; optional | Explicit circle email alerts, with configured contacts and a verified sender. |
| `GEMINI_API_KEY` | Convex backend environment; optional | Existing message/image features. |

`CONVEX_SITE_URL` is provided by Convex for its HTTP/auth endpoints. Preserve the
existing project auth setup. [Convex environment variable documentation](https://docs.convex.dev/production/environment-variables).

The root [`.env.example`](.env.example) documents names only; copying it does not
configure backend variables. **Never prefix a secret with `VITE_`** or commit
`.env.local`, runtime credentials, service keys, private audio or model weights.
No separate browser pairing key is needed. Access to the model is authenticated
server to server, and each user's jobs can only be read/cancelled by that user.

## Configure the hosted TrustLens frontend

Pushing this branch publishes source code; it does not by itself deploy Convex
or switch an existing frontend's production branch. To connect the hosted app:

1. Keep the operator's gateway running with production sync:

   ```powershell
   .\tl_model_lcu\Start.cmd --sync-prod
   ```

   Stop a development gateway first: only one instance can use port 8766.

2. Deploy the backend from branch `LCU`:

   ```powershell
   npx convex deploy
   ```

3. In the existing frontend host, deploy branch **LCU**. Set its
   `VITE_CONVEX_URL` to the **production** Convex cloud URL, then rebuild.
   Set production Convex `SITE_URL` to that frontend's exact HTTPS origin.
   A Vercel preview should also use a matching auth/frontend-origin setup.

4. Open the deployed frontend on another device, sign in and test Upload Check.
   All detector requests now go through Convex to the operator's laptop.

For a stable tunnel that is already running and routes to port 8766:

```powershell
.\tl_model_lcu\Start.cmd --url https://your-detector-host.example --sync-prod
```

Without `--url`, the launcher uses a no-account/no-card Cloudflare Quick Tunnel.
Those tunnels are for testing/development, have no uptime guarantee, and get a
new URL on each restart. Restart with the same sync flag to update Convex;
users do not re-pair and no frontend rebuild is needed just for a new tunnel URL.
[Cloudflare limitations](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Limits and troubleshooting

- One running inference and at most two unfinished jobs across all users.
  Overload returns a busy message; the queue does not grow without bound.
- 12 submissions and 180 health/poll/cancel requests per authenticated user per
  rolling minute. Six-second live sampling is subject to shared capacity.
- Audio goes through Convex/the tunnel to the operator's laptop. This feature
  does not save raw audio in the ledger; existing temporary decoder files are
  deleted and derived features/results expire after roughly 15 minutes.
- **Offline/unreachable:** check that the laptop is awake, the launcher and
  tunnel are running, and the correct `--sync-dev`/`--sync-prod` was used.
- **Not configured:** the two `TL_MODEL_*` variables are missing in the deployment
  the browser uses. Restart the launcher with the matching sync flag.
- **Function not found:** deploy/sync the LCU Convex code, including
  `src/convex/laptopModel.ts` and its referenced implementation.
- **Startup/model error:** check the trained export paths and launcher log.
  First model load can take a few minutes. No placeholder prediction is returned.
- **Port 8766 in use:** stop the earlier gateway before restarting it.
- **Busy/check limit:** retry later or stop other live checks.
- Stop with Ctrl+C. Keep `runtime/service.json` for the next run; deleting it
  and restarting with a sync flag rotates the service credential.

## Development checks and layout

```powershell
npm test
npm run typecheck:tests
npm run typecheck:lcu
npm run lint
npm run build
.\.local\voice-sentinel-venv\Scripts\python.exe -m unittest discover -s tl_model_lcu -p "test_*.py" -v
```

| Location | Purpose |
| --- | --- |
| `tl_model_lcu/` | New gateway, launcher, Convex action implementation, frontend adapter, reuse map and tests. |
| `src/convex/laptopModel.ts` | Small re-export of the action implementation; no duplicated backend. |
| `src/components/dashboard/LocalVoiceCheck.tsx` | Reused upload, recording and result UI with an injected Convex transport in shared mode. |
| `src/hooks/use-local-live-voice.ts` | Reused microphone, speech gating and bounded latest-sample handling. |
| `ml/voice_sentinel/local_service.py` | Reused engine, worker, decoder, cache, job limits and cancellation. |
| `tests/` | Existing app/backend regression tests; `npm test` also runs LCU tests. |

The detector remains experimental. Its score/vote is not proof of voice origin
or a calibrated probability, and the check does not establish whether a call is
a scam. Save/alert actions remain explicit choices.
