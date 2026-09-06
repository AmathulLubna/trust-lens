# Trust Lens — Tech Stack Decision Record

**Date:** August 2026 · **Decision:** Mobile-compatible **web app** (per product decision), PWA-ready, with a documented Android phase-2 path.

---

## 1. Stack Summary

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | **React 19 + Vite + TypeScript** | Project template; fast HMR, strict types, huge ecosystem |
| Styling | **Tailwind CSS v4** (+ shadcn/ui idioms, Framer Motion) | Design-system speed; custom clean & bold tokens in `index.css` |
| Backend / database | **Convex** | Reactive queries (call ledger updates live), serverless mutations, auth integration, zero DevOps |
| Auth | **Convex Auth** — email OTP + anonymous guest | Template-native; no extra service needed for MVP |
| Voice analysis (demo) | **Web Audio API** (`AnalyserNode`, autocorrelation pitch tracking) | Real, in-browser, privacy-preserving; no SDK needed |
| Hosted AI (Phase 2) | **Groq** — Whisper transcription + lightweight voice classifier + LLM behavioral scan | Exact match to the pitch: <2 s fast inference, cheap, on-device-heavy design |
| Notifications (Phase 2) | SMS / WhatsApp Business API for trusted circle | Reaches elderly users' family where they actually are |
| Packaging | PWA manifest (already present) → installable; Android wrapper in Phase 2 | Mobile-compatible today, app-store path later |

## 2. Why This Stack (per requirement)

- **"Real-time pipelines"** → Convex mutations/queries are sub-100 ms round trips; the browser-side analysis loop runs at 60 fps with no server hops for the core feature.
- **"Groq for fast inference"** → Groq's LPU runs Whisper-small and small classifiers in well under 2 s; reserved for Phase 2 relay actions in Convex (`"use node"` + `process.env` keys).
- **"Mobile compatible"** → responsive bottom-nav/sidebar shell, touch-friendly targets, viewport-correct meta tags, manifest for install.
- **"Consumer-facing, elderly users"** → large type, high-contrast clean palette, verdict-first UI (icon + text + vibration sim, never color alone).

## 3. Data & State
- Server state: Convex reactive queries — no duplicate client state.
- Client state: React `useState`/`useRef` for simulator and audio loop only (transient by nature).
- Persistence: Convex tables `callLogs`, `trustedCircle`, `userSettings`.

## 4. External Services (roadmap — not required for MVP)

| Service | Purpose | Key(s) needed |
|---|---|---|
| Groq | Whisper + classifier + LLM | `GROQ_API_KEY` (via project Keys UI) |
| SMS/WhatsApp provider | trusted-circle alerts | provider API key |

Gravity Index was consulted to select the above; integration will be wired through
Convex actions reading `process.env`, per Freebuff conventions.

## 5. Explicitly Rejected
- Native-only audio interception for the MVP (Android-only would ship to no one in week one; web demo + documented phase 2).
- A second database (Postgres etc.) — Convex already covers reactive reads + writes for this workload.
- Client-side ML model downloads (TFLite/ONNX) for the MVP — Web Audio heuristics demonstrate the pipeline without MB-scale assets; revisit for phase 2 edge inference.
