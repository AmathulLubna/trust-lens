# TrustLens web prototype — SIH26104

TrustLens screens consented recordings and nearby microphone audio for possible synthetic speech and sensitive requests. Acoustic model outputs, transcript warnings and input reliability are separate. It does not verify caller identity, intercept cellular/WhatsApp audio, or establish fraud. No accuracy or latency benchmark is claimed.

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for repair evidence, tests and remaining prerequisites. `docs/PRD.md`, `docs/TRD.md` and `docs/TECH_STACK.md` are historical proposals, not current feature guarantees.

## Current behavior

- Recording uploads require an authenticated account and processing consent. Audio goes through temporary Convex storage to a configured Python service. Server checks bound bytes, validate the decoded container, and limit duration to five minutes. Normal completion removes temporary files; failures remain uncertain.
- The Python service uses a versioned Hugging Face acoustic checkpoint and local faster-whisper transcription. The acoustic output is uncalibrated. The verification-warning threshold of 0.7 is an explicit prototype policy, not a measured fraud probability. No random boosts, browser DSP authenticity scores or invented confidence are used.
- Microphone capture sends independent six-second WAV segments. Capture transfer and processing queues are bounded. Original capture times, sequence numbers, missing coverage and finalization failures remain visible. The page must stay active; device/background behavior needs testing.
- Transcripts are displayed for the current analysis. Retaining them in history requires an explicit checkbox, initially off. Message previews also require consent. Clearing history removes stored assessments and temporary uploads and excludes earlier in-flight completions. Already delivered email cannot be recalled.
- English, Hindi and Hinglish request rules distinguish requests from educational warnings and negation. These finite rules can miss contextual intent and do not prove fraud. Number reports are unmoderated observations; notes remain owner-private and legitimate observations are counted separately. No unsourced reputation fixtures are active.
- Warning email requires owner preference, member preference, a verified recipient account and the recipient's own consent. Delivery is disabled unless explicitly enabled on the server. Provider acceptance is separate from signed delivery confirmation. Transport interruption is recorded as unknown. Scripted demonstrations never generate real detection history or alerts.

The website caps uploads at 18 MiB, conservatively below the documented HTTP upload limit; the service retains a 24 MiB maximum for legacy clients. See [Convex HTTP upload documentation](https://docs.convex.dev/file-storage/upload-files).

## Local setup

Install Node.js compatible with Vite 7 (the repair was checked with Node 26.5.1), then run `npm ci`. Do not replace existing environment files or credentials.

For a new configuration, use `.env.example` as a guide. The browser needs `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` for the same deployment. The latter is the Convex HTTP actions address, not the Vite website address. Configure Convex Auth using its existing setup workflow. Email OTP delivery additionally needs `FREEBUFF_EMAIL_API_KEY`; no usable OTP credential is bundled. Anonymous accounts can screen audio but cannot verify email alert ownership.

On the Convex server configure `WEB_ORIGINS`, `ACOUSTIC_SERVICE_URL` and `ACOUSTIC_SERVICE_TOKEN`. The service URL must be reachable by the Convex deployment over HTTPS; a laptop's localhost is not reachable from hosted Convex. Never put the shared token in a `VITE_*` variable. Backend setup and the stateless service contract are documented in `C:\Users\Admin\Desktop\Projects\New folder\trustlens-backend\WEB_INTEGRATION.md`.

`npm run dev` starts the website. Convex functions and generated bindings require an operator's configured development deployment; no deployment was performed during this repair. The added bindings compile locally and were exercised with `convex-test`.

Optional email delivery needs `RESEND_API_KEY`, a verified `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, and signed Resend events directed to `/alerts/webhook` on the Convex site URL. Keep `ALERT_DELIVERY_ENABLED=false` while preparing configuration. There is no SMS, WhatsApp alert delivery, fullscreen intervention, speaker enrollment, or sensitivity calibration implemented.

## Verification

```powershell
npm test
npm run build
npm run lint
npm audit --audit-level=low
```

The regular suite is network-free. One real-service smoke test is intentionally skipped unless opted into an isolated local service and generated speech fixture. See `tests/README.md`. Lint currently has nonblocking template/generated-file Fast Refresh warnings; no lint errors remain.

For fixture-only browser checks run `npm run test:ui` and open `http://127.0.0.1:5174/tests/ui/index.html`. The harness visibly labels mocked responses and is excluded from the production entry point. It is not an authentication or production-service test.
