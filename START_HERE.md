# TrustLens project guide

## LCU branch: shared detector

Start with [README.md](README.md) for the current LCU setup and key configuration.
Run the web app with `npm run dev:full`, then run
`tl_model_lcu\Start.cmd --sync-dev` in another terminal. Authenticated users now
use the shared detector on the operator's laptop without a pairing key.
The older per-browser companion below is only for the standalone local preview.

## Open the app

- Double-click [Start-TrustLens.cmd](Start-TrustLens.cmd) to start TrustLens.
- For the optional local voice detector, also run [Start-VoiceSentinel.cmd](Start-VoiceSentinel.cmd).
- Connection and backend setup: [CLOUD_SETUP.md](CLOUD_SETUP.md).
- Local voice setup: [LOCAL_WEB_DEMO.md](ml/voice_sentinel/LOCAL_WEB_DEMO.md).
- Project report: [TrustLens_Judges_Report.pdf](output/pdf/TrustLens_Judges_Report.pdf).

## Folder map

| Location | Contents |
| --- | --- |
| `src/pages/` | App pages |
| `src/components/` | Dashboard and shared UI components |
| `src/hooks/` | React hooks |
| `src/lib/` | App utilities and voice processing |
| `src/convex/` | Backend functions, schema, and generated bindings |
| `public/`, `src/assets/` | App images and public assets |
| `tests/` | App and backend tests |
| `ml/voice_sentinel/` | Local voice service, training scripts, notebooks, and evaluation records |
| `ml/voice_sentinel/VoiceSentinel_Model/` | Installed local model files |
| `ml/voice_sentinel/downloads/` | Model downloads and experiment artifacts |
| `scripts/` | Report generation tools |
| `output/pdf/` | Generated project report |
| `.github/workflows/` | Automated project checks |

## Local files to keep

| Location | Purpose |
| --- | --- |
| `.env.local` | Private connection settings |
| `node_modules/` | Installed JavaScript dependencies |
| `.local/voice-sentinel-venv/` | Python environment used by the local voice launcher |
| `.local/kaggle-cli-venv/`, `.venv-audio/` | Additional installed Python environments |
| `.local/home/` | Local database and session files |
| `.local/models/` | Additional downloaded models |
| `.local/delivery/` | Packaged deliverables and audits |
| Other `.local/` files | Local evaluation evidence, review snapshots, helper scripts, and logs |
| `dist/` | Existing production build, usable with `npm run preview` |

Root configuration files stay in place because build tools and launchers use
their current paths. Integration usage notes remain in [integrations.md](integrations.md).

## Cleanup on 30 October 2026

Rebuildable JavaScript caches, Python bytecode caches with matching source
files, and empty folders were collected into `cleanup-caches-2026-10-30` and
sent to the Windows Recycle Bin. Python and JavaScript recreate caches as needed.
The recycled bundle includes a manifest of the original paths for recovery.
