# Independent website project

Canonical website source: `D:\trust-lens-main`.

- React website: `src/`, static files, demo and local UI harness.
- Website application backend: `src/convex/`; operator configures its own Convex deployment and authentication. Keep its URL/credentials separate from any other project.
- Website acoustic service: `services/acoustic/web_acoustic/`; independent source fork of the reviewed acoustic/demo modules. No Android case API, database, durable case queue or trusted-identity enrollment is included.
- Website-only Python environment: `services/acoustic/.venv/`. Website audio/model cache: `services/acoustic/.runtime/`, ignored by Git. Own environment file: `services/acoustic/.env.web`, ignored. Only `TRUSTLENS_WEB_*` service settings are read; app token/storage/database settings do not configure this service.
- Service defaults to loopback port **8876**, distinct from the previous app service/demo ports. The recording adapter requires `service=trustlens-web-acoustic-v1` in responses. Controlled-demo clients verify its unauthenticated `/health` identity before sending a personal credential.
- The app/Android directory and its existing backend remain independent. No source synchronization, shared database, symlink, credential transfer or launcher into those projects is configured. Their existing changes are not rolled back by the website separation.
- Local recoverable website snapshots and Git bundles live under `.checkpoints/` and are ignored. The C-drive publishing checkout was redundant and has been removed after preserving its branch in a bundle. Historical multi-project repair backups remain historical backups, not active website dependencies.

Never copy an app `.env`, database, recordings, virtual environment or personal token into this website. Never put the Python shared service credential in browser `VITE_*` variables. The existing website `.env` has been preserved, so an operator must review its Convex deployment/endpoint assignment before using real services.

This local separation does not migrate any hosted deployment or undo app/backend changes made earlier or by another project owner. Future app and website work should be requested and reviewed independently.
