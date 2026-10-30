# TrustLens model on the operator's laptop

**On branch `LCU`, the integration is already applied.** Follow the project-root
[README](../README.md) for the current run commands and key configuration.
The patch instructions below are for reusing this layer on an older checkout.

This folder contains the **new connection layer only**. It stays beside the
existing project and imports its implementation and model files by reference.
It is not a standalone copy of TrustLens or VoiceSentinel.

```text
User's browser (no model, Python installation, or pairing key)
  -> existing authenticated production Convex
  -> HTTPS tunnel
  -> this folder's gateway on the operator's laptop, port 8766
  -> existing VoiceSentinel service/engine and existing model weights
  -> result through Convex to the user
```

The operator's laptop must remain awake, online, and running the launcher.
This is a limited beta architecture, not a promise of capacity for thousands
of simultaneous live checks. Cloudflare Quick Tunnels need no account or card,
but are intended for testing/development, change hostname on restart, and have
no uptime guarantee. For ongoing public production traffic, use a stable tunnel
appropriate for that use, supplied with `--url`.

## What is reused and where to update it

| Existing source of truth | Reference from this folder / purpose |
| --- | --- |
| `../ml/voice_sentinel/local_service.py:create_app` | `gateway.py` mounts it in process using an internal ASGI client. Reuses model startup, one inference worker, two-job capacity, upload checks, cancellation, cache and cleanup. Do not start a second copy on 8765 for this integration. |
| `../ml/voice_sentinel/local_service.py:Engine` | Loaded by the reused app. Change inference or model-path selection there, not in this gateway. |
| `../ml/voice_sentinel/feature_detector.py` and `audio_windows.py` | Imported by the existing engine. Feature extraction and window scoring stay there. |
| `../ml/voice_sentinel/downloads/v4-augmented/VoiceSentinel_Model/` | Default v4 weights/configuration, read in place. Nothing is copied or downloaded here. |
| `../ml/voice_sentinel/downloads/v5/VoiceSentinel_v5/VoiceSentinel_Model/` | Optional v5 files, read through the existing engine. Its compatibility checks remain in force. |
| `../.local/voice-sentinel-venv/` | `Start.cmd` uses this Python environment directly. `requirements.txt` references the existing requirement files. |
| `../src/lib/local-voice.ts` | `frontend/client.ts` subclasses the existing client and imports its types. Only its transport changes to Convex; the result contract stays shared. |
| `../src/components/dashboard/LocalVoiceCheck.tsx` | `frontend/HostedVoiceCheck.tsx` wraps this UI after the small integration patch adds an optional transport prop. No duplicate upload/recording/result UI. |
| `../src/hooks/use-local-live-voice.ts` | Used by the existing UI unchanged: microphone capture, speech gating, latest-sample queue, cancellation and cleanup. |
| `../src/components/dashboard/LocalVoiceLedgerActions.tsx`, `../src/convex/calls.ts`, `../src/convex/voiceResult.ts` | Existing explicit ledger save/circle-alert flow and result validators. Experimental/inconclusive results stay experimental/inconclusive. |
| `../src/convex/_generated/server` and existing Convex Auth | `convex/model.ts` imports the real action constructor and verifies the actual signed-in user. No separate user database. |

All paths above are relative to this folder. When upstream APIs change, update
the imports/adapter and the small patch contexts rather than copying their files.

## New files

- `gateway.py`: authenticated, server-only facade around the reused Python app.
  Exposes health/session and submit/read/cancel jobs. Never exposes the pairing
  page, pairing API, static assets, model files or the React app.
- `convex/model.ts`: authenticated action that calls only the configured HTTPS
  origin; derives user identity from Convex Auth. The browser cannot supply a
  destination URL, service credential, or another user's identity.
- `frontend/client.ts`: transport adapter. Reuses the existing client interface
  and preserves job IDs when a submission needs cancellation.
- `frontend/HostedVoiceCheck.tsx`: wrapper for the existing UI.
- `integration.patch` and `apply_integration.py`: activate the above by reference.
- `launch.py` / `Start.cmd`: start the gateway/tunnel and optionally set the
  two Convex environment variables without printing the credential.

## Activate the app integration

Run from the **project root**, one directory above this file. On branch `LCU`,
the integration is already applied. The commands below are only needed when
reusing this folder on an older, unintegrated checkout. The helper detects an
already-applied patch and leaves it in place.

```powershell
# Check first. This makes no changes.
.\.local\voice-sentinel-venv\Scripts\python.exe tl_model_lcu/apply_integration.py

# Apply the small, checked integration patch.
.\.local\voice-sentinel-venv\Scripts\python.exe tl_model_lcu/apply_integration.py --apply
```

The patch changes only these integration points:

1. `src/components/dashboard/LocalVoiceCheck.tsx`: optional injected client,
   remote-audio disclosure, 3 MiB limit, and no pairing controls in shared mode.
   Existing standalone local mode still works.
2. `src/components/dashboard/UploadCheck.tsx`: authenticated users get the shared
   wrapper; the local-only preview retains its existing companion mode.
3. `src/components/dashboard/LiveGuard.tsx`: the VoiceSentinel choice uses the
   shared wrapper. The hosted transcript/scam option remains available.
4. `src/components/dashboard/LocalVoiceLedgerActions.tsx`: wording applies to
   both transports and accurately describes what is saved.
5. `src/convex/laptopModel.ts`: a tiny Node-action re-export of
   `../../tl_model_lcu/convex/model`, not another implementation.

If the patch fails its context check, it leaves the files untouched. Review
the referenced files and update the patch for their current shape.
To undo an applied patch, first check with `--reverse`, then add `--apply`.
Reversal also checks contexts; it does not reset unrelated work.

## Run without a card or user pairing

1. Use the existing Python environment and installed model. If dependencies are
   missing, install using the references, not another model/environment copy:

   ```powershell
   .\.local\voice-sentinel-venv\Scripts\python.exe -m pip install -r tl_model_lcu/requirements.txt
   ```

2. Install `cloudflared` using its official Windows installation instructions
   linked below. The launcher checks for it on `PATH`; it never installs it
   silently. An existing user-managed tunnel can be used with `--url` instead.

3. Test against development first, or select the production deployment
   deliberately. You must already be signed into the project's Convex CLI.

   ```powershell
   # Starts the gateway and temporary tunnel; configures development Convex.
   .\tl_model_lcu\Start.cmd --sync-dev

   # Or configure production Convex instead.
   .\tl_model_lcu\Start.cmd --sync-prod
   ```

   These are alternatives: do not start both on port 8766. Running `Start.cmd`
   without either sync flag starts the service/tunnel but does not change Convex.
   A stable, already-running tunnel can be selected with
   `--url https://your-detector-host.example --sync-prod`; it must route to
   `http://127.0.0.1:8766` on this laptop.

4. After applying the integration, deploy the new action using the project's
   usual Convex workflow (`npx convex dev` for development or `npx convex deploy`
   for production). Rebuild/redeploy the frontend using the matching deployment's
   `VITE_CONVEX_URL`. The current root `.env.local` is linked to development;
   setting production model variables does not change that frontend setting.

5. In Upload Check choose **Human or AI voice**, then **Connect detector**.
   In Live Guard choose **VoiceSentinel · shared AI voice check**. Users only
   grant microphone permission if recording; no local-network access or pairing
   is needed. The UI explains that audio is processed on the operator's laptop.

6. Keep the launcher running. Stop with Ctrl+C. A temporary tunnel gets a new
   URL next time; restart with the appropriate sync flag to update Convex.
   A tunnel restart does not require a frontend rebuild or users to re-pair.

The launcher automatically creates a persistent service credential in
`runtime/service.json` (gitignored) and supplies it to the gateway. With a sync
flag it writes `TL_MODEL_URL` and `TL_MODEL_SERVICE_SECRET` into the selected
Convex backend environment. No `VITE_` secret and no browser pairing key.
The existing internal companion token is obtained automatically inside Python
and never exposed by the gateway. Keep the runtime credential private; removing
it and restarting with a sync flag rotates it.

## Limits and operational behavior

- 3 MiB encoded-file input limit before base64 conversion. This stays below
  Convex Node actions' 5 MiB argument limit after conversion and metadata.
- Existing decoder accepts 1–120 seconds. Six-second live sampling is reused.
- One active inference and at most two unfinished jobs across everyone;
  overload returns a clear busy error. No unbounded waiting queue.
- Twelve submissions per authenticated user per rolling minute, and 180
  health/poll/cancel requests per minute. This allows one six-second live stream
  plus a small retry/upload margin, subject to the shared two-job capacity.
  Review the cap in `gateway.py` against measured capacity before raising it.
- Jobs are private to the submitting user, including cancellation. Owner IDs
  are supplied only by the authenticated Convex action. In-memory owner/rate
  tracking is bounded and expires; gateway restarts invalidate pending IDs.
- Audio is sent through Convex and the tunnel to the operator's laptop. This
  feature does not persist raw audio in Convex tables/storage or the ledger.
  Existing temporary decoder files are removed; derived features/results have
  the existing approximate 15-minute expiry. Do not log action audio arguments.
- Laptop/tunnel failures surface as unavailable errors. There is no silent
  fallback to another model, fabricated result, or automatic circle alert.
- Free Convex plan quotas and tunnel terms still apply. No billing upgrade,
  deployment, public tunnel or model upload was performed to create this folder.

## Verification

```powershell
# Gateway tests reuse the existing fake engine and the actual existing job API.
.\.local\voice-sentinel-venv\Scripts\python.exe -m unittest discover -s tl_model_lcu -p "test_*.py" -v

# On LCU the patch is already applied. Run:
npm exec vitest -- run --config tl_model_lcu/vitest.config.ts
npm exec tsc -- -p tl_model_lcu/tsconfig.json
npm run build
```

Tests cover authentication before upload, hidden pairing endpoints, job
ownership, actual byte forwarding through Convex, invalid/oversized inputs,
bounded jobs, cancellation, offline/overload errors, and the reused UI without
pairing controls. They do not establish throughput or model accuracy.

## Provider references

- [Cloudflare Quick Tunnels: no account, temporary URLs, testing-only limitations](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
- [Install cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
- [Convex actions and outbound requests](https://docs.convex.dev/functions/actions)
- [Convex argument/resource limits](https://docs.convex.dev/production/state/limits)
- [Convex environment variables](https://docs.convex.dev/production/environment-variables)
