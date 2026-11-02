# TrustLens LCU

TrustLens LCU combines a React/Vite dashboard and Convex backend with a shared laptop-hosted voice detector. The current LCU application source is at this branch's repository root and does not depend on the separate normal TrustLens checkout.

## Source layout

- `src/`: dashboard, authentication, Live Guard, Upload Check, number/message checks, call ledger, Alert Circle and Convex functions.
- `frontend/` and `convex/`: shared-detector UI/client and authenticated Convex adapter.
- `gateway.py` and `service/`: authenticated gateway, decoding, feature extraction and inference.
- `tests/`, `test_gateway.py` and `service/test_local_service.py`: frontend, backend and service checks.

Desktop startup files and their tests were excluded from this update. Documentation other than this README was also excluded. Existing historical files were left unchanged; their older nested-layout instructions do not describe the current root source layout.

## Website

Use a Node version supported by package.json:

```sh
npm ci
npm run dev
```

Create a private `.env.local` with the public `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` for the intended backend. Local Vite uses port 5174. `npm run build` writes the production website to `dist/`.

LCU production is `anirudh-upadhyay:trustlens-lcu:production` (`outstanding-falcon-217`). Its API origin is `https://outstanding-falcon-217.convex.cloud` and auth origin is `https://outstanding-falcon-217.convex.site`. The original TrustLens backend remains separate. Select the intended deployment explicitly for Convex commands; a frontend URL does not select the CLI target. Configure backend auth SITE_URL for the intended frontend origin.

## Shared model service

Use Python 3.12 with `requirements.txt`, or a compatible separately maintained private runtime. Restore the matching trained exports under `models/v4` and `models/v5`, including encoder, preprocessing configuration, detector specification, classifier head and operating threshold. Weights/runtime binaries are excluded from Git; a generic base model is not a substitute.

Set a private random `TL_MODEL_SERVICE_SECRET` of at least 32 ASCII characters, then run from the repository root:

```sh
python -m uvicorn gateway:create_gateway --factory --host 127.0.0.1 --port 8766 --no-access-log
```

Route an HTTPS tunnel or suitable hosting endpoint to this gateway. After authenticated public readiness succeeds, configure `TL_MODEL_URL` and the matching `TL_MODEL_SERVICE_SECRET` only in the selected Convex backend environment. Never tunnel the internal service's pairing/frontend API or put a service/provider secret in a VITE variable. Starting the website alone does not start the model or establish its tunnel.

Browser users sign in or use Guest and select the shared detector in Upload Check or Live Guard. They do not install Python or enter a pairing key. The laptop must remain online for shared inference; quick tunnels can change URL and do not guarantee uptime.

## Behavior and limits

V4 stays default and v5 stays experimental. Scores are uncalibrated; votes are not proof of origin or fraud. Keep the Inconclusive assessment and explicit ledger-save/alert choices. Earlier adapted local comparisons do not establish independent accuracy.

Shared audio is limited to 3 MiB and 1–120 seconds. The service has one inference worker, bounded pending work, per-user ownership/rate limits and result expiry. This voice path does not persist raw audio to Convex tables/storage. Transcription, OTP email and alerts need their separately configured providers.

## Checks

```sh
npm run lint
npm test
npm run typecheck:tests
npm run typecheck:lcu
npm run build
npm run test:python
```

Gateway/service tests exercise authentication, ownership, queue limits, cancellation and decoding with a fake inference engine. They do not establish model accuracy, provider delivery or tunnel availability. Real inference requires the separately restored exports and compatible runtime.

Keep private environment files, credentials, recordings, weights, vendor binaries and node_modules out of Git. A source clone is not a private-runtime backup. Preserve the trained exports' original dataset/model notices, including applicable MLAAD noncommercial research restrictions.
