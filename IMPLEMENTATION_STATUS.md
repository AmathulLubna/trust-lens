# TrustLens website implementation status — 8 October 2026

## Current project boundary

The canonical website is **D:\trust-lens-main**. React, Convex code and its independent acoustic service all live here. The Android/app directory and its existing Python backend are separate projects. The previous C-drive website publishing worktree was removed after preserving its Git history; its publishing backup moved under the website's ignored `.checkpoints/` directory.

The new `services/acoustic/web_acoustic` package is an independent source fork of the reviewed acoustic and optional controlled-demo modules. It includes no app `/cases` API, database, migration, durable case queue, enrollment or app credentials/recordings. Website-specific settings use `TRUSTLENS_WEB_*`; its Python environment, model cache, temporary audio and `.env.web` are isolated. See [PROJECT_BOUNDARIES.md](PROJECT_BOUNDARIES.md) and [service setup](services/acoustic/README.md).

This supersedes earlier shared-service setup instructions. Previous cross-project evidence/status documents remain in local recovery snapshots; they do not prove the new independent service is deployed or has usable model weights. Existing app/backend work was **not rolled back**: its source was fingerprinted before this separation, and all recorded source hashes still match afterward. No further app/backend files were modified during this separation.

## Preserved repairs

- Explicit unavailable, insufficient-audio and inconclusive assessments remain separate from acoustic scores, context warnings and reliability, including stored history. No safety/caller identity guarantee or invented confidence.
- English/Hindi request rules handle Unicode, word boundaries, negation and educational warnings. Regression examples include shopping, never share your OTP and Hindi money requests.
- Authenticated binary recording uploads replace oversized base64 arguments. Owner binding, claim-once analysis, server byte/container/duration checks and cleanup are retained.
- Microphone WAV segments use bounded queues with original sequence/timing, coverage gaps, isolated sessions, flush/drain/finalization and protection against stale/history-deleted completions.
- Transcript/message preview history requires explicit consent. Warning delivery checks preferences and independently verified/consented recipients, deduplicates attempts and records truthful delivery states. Delivery remains disabled without separate configuration.
- No unsourced number fixtures are active; aggregate observations, legitimate reports, private notes and identifiers remain protected. Unsupported settings and prototype website claims are explicit.
- GitHub theme/cookie/privacy controls are synchronized into the D-drive source. Existing local build configuration and legacy WhatsApp history compatibility are preserved. Schema additions tolerate older settings rows.
- Scripted/controlled demonstrations are labeled, excluded from real detection history and cannot authorize real transactions.

## Separation and port repairs

- Port 5174 was occupied by an already-running Vite UI harness from D:\trust-lens-main. Only that identified website process was stopped. The harness now tries a free port instead of failing; fixture upload transport uses a same-origin mock route rather than a fixed port.
- Website service defaults to **8876**. Recording results require `service=trustlens-web-acoustic-v1`; mismatched service results become unavailable and remain in history. Demo clients check public website service identity before sending participant credentials.
- Runtime startup reads only `services/acoustic/.env.web`; no discovery/loading of a parent/app `.env`. Model cache/audio storage remain under the website service. No app virtual environment, database, model weights, recordings or live credentials were copied.
- README/local tests/demo helpers now point at the D-drive website, its own service and website-only private test bootstrap. No launcher imports or starts the app backend.

## Checks actually run after separation

- `npm test`: **51 passed, 1 optional real-model service integration test skipped**.
- Website Python `unittest discover`: **14 passed**, including real ffmpeg/ffprobe decoding and real child-process silence handling with generated WAVs; score-preservation fixtures are explicitly mocked.
- Production and standalone demo builds passed. TypeScript failure from a legacy WhatsApp history field was reproduced and fixed by retaining the legacy schema value.
- Full lint: **0 errors, 20 nonblocking Fast Refresh/generated-file warnings**. Backup/runtime output is excluded from lint. Production bundling retains the existing local manual chunks and emits an empty Convex-vendor-chunk warning.
- Local Edge fixture harness loaded recording consent controls and settings without console errors. New independent core Python environment installed successfully; `pip check`: no broken requirements.
- The website API started from D-drive code: `/health` reports project `trustlens-web`; `/ready` is conservatively unavailable without usable model/checkpoint/service-auth configuration.
- Reproduced an occupied 5174: a second harness started successfully on 5175. Extra verification process was stopped afterward.
- Source-hash preservation check: **0 changes** in the other projects' recorded source files. Original website credentials were preserved.

## Remaining prerequisites / ready for testing

Fixture-only UI, policy/ownership regression tests and generated decoder tests are ready locally. The independent service currently has **core/test dependencies**, not the optional full ML runtime or acoustic/Whisper checkpoints. Install `services/acoustic/requirements-ml.txt` and obtain the pinned public checkpoints in this website's own model cache before testing real detector availability. Supply a new website-only service token and configure a separate website Convex deployment/HTTPS-reachable service endpoint. Do not use app credentials or point at the app backend.

Controlled peer calls also require independently provisioned website participant/verifier credentials and optional TURN infrastructure. Physical microphones, background/sleep behavior, cross-network/device calling, deployed Convex authentication, real email receipts and actual human independent confirmation remain unverified for this separated setup. No model accuracy benchmark is claimed. No private audio, real alerts, deployment or credential overwrite was performed.

## Recovery

Before changes: website source snapshot, pending binary patch and complete Git bundle under `.checkpoints/separation-20261008/`; local checkpoint commit `039189b` preserves the current user demo edits. Earlier GitHub branch/tag histories are preserved in `published-branch.bundle`. GitHub main/recovery tag remain unchanged. Local separation work is recorded in small commits. Do not publish `.checkpoints`, runtime recordings, databases, private environment files or virtual environments.
