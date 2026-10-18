<div align="center">

# 🔍 Trust Lens

### Real-time deepfake voice & scam detection — microphone, uploads, numbers and messages

Detect AI voice cloning, flag social-engineering scam patterns, and alert the right people — **before anyone sends money**.

[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)](https://vitejs.dev)
[![Convex](https://img.shields.io/badge/Convex-backend-ff5c29?logo=convex&logoColor=white)](https://convex.dev)
[![Groq](https://img.shields.io/badge/Groq-AI%20inference-f55036)](https://groq.com)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)


</div>

---

## The problem

AI voice-cloning scams are exploding across India. Using a **3-second voice clone** of a relative, fraudsters call and say:

> *"Beta, I'm in trouble — send money right now."*

Elderly users are the primary victims, and until now there has been **no consumer-facing defense**. Trust Lens is a mobile-compatible web app that listens, analyzes, and intercepts these calls in real time.

## What it does

Trust Lens runs **two detection agents in parallel** on every call, then **intervenes mid-call** when both raise flags:

| Agent | What it does | Where it runs |
|---|---|---|
| **Voice authenticity** | Measures pitch jitter, prosody flatness, and spectral rolloff — TTS/voice-clones are unnaturally steady (jitter < 1.5%) vs. human speech (3–8%) | On-device via Web Audio API + Groq cross-check |
| **Scam-pattern behavior** | Reads the conversation for urgency language, money/OTP requests, and claimed-but-unverified relations | Groq LLM (transcribed with Groq Whisper) |
| **Intervention** | Mid-call banner + vibration: *"Possible voice clone + urgency scam pattern detected"* — with one clear action: verify on a separate channel | In-app |

### Feature tour

- **🛡️ Live Guard** — *Test bench:* simulate the classic "Amma in trouble" scam call and watch both agents work in real time, or run a **live voice check** on your microphone: on-device acoustics score the voice instantly while Groq Whisper transcribes full sentences and the LLM cross-checks content automatically.
- **🔢 Number Check** — *Screening desk:* paste any number (missed call, SMS sender, saved contact) and get a risk verdict from pattern heuristics (TRAI 140-series UCC ranges, burner-SIM repeated digits, sequential/zero-heavy lines), the shared team knowledge base, and a Groq second opinion. Every lookup is recorded.
- **💬 Message Check** — Paste an SMS or chat message and get a verdict from heuristic signal scanning plus a Gemini (primary) / Groq (fallback) opinion, with the exact markers that drove the score.
- **📜 History Ledger** — Every screened call and check on record: verdict, risk score, markers, duration, and opt-in transcripts — filterable and clearable in one tap.
- **👥 Alert Circle** — A trusted team ("your family safety net"): when a call is flagged, the right people are notified automatically — with *who, when, and the verdict, never the transcript*.
- **⚙️ Settings** — Light / dark / system theme, auto-notify for your alert circle, a link to the Privacy Policy and cookie preferences. Acoustic scoring runs in the browser; audio chunks go to Groq for transcription and are not stored; transcripts are saved only on explicit opt-in.
- **🔒 Privacy & cookies** — `/privacy` policy page and a cookie-consent banner (essential vs. optional preference storage; no analytics or ad cookies). Edit the contact in `src/pages/Privacy.tsx`.

## How the verdict is calculated

```
risk = pattern heuristics        (140-range, burner digits, sequential…)
     + seed knowledge base       (known scam numbers shipped in-app)
     + team reports              (shared community reporting)
     + Groq / Gemini second opinion (calibrated, never alarmist)

verdict = safe (0–39) → suspicious (40–69) → flagged (70–100)
```

The verdict always follows the evidence shown — no random results, no contradictions.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | **React 19 + TypeScript + Vite 7** |
| Styling | **Tailwind CSS v4** + shadcn/ui + Framer Motion |
| Backend & database | **Convex** (reactive queries, serverless mutations, zero DevOps) |
| Auth | **Convex Auth** — email OTP + anonymous sign-in |
| Voice analysis | **Web Audio API** (`AnalyserNode`, autocorrelation pitch tracking) — fully on-device & privacy-preserving |
| Hosted AI | **Gemini** (message checks, primary) + **Groq** (Whisper transcription, LLM behavioral scan, message-check fallback, number-opinion classifier) |
| Packaging | PWA manifest — installable, mobile-compatible |

---

## Getting started

### Prerequisites

- Node.js 24.15+ and npm (the checked-in npm lockfile is used by CI)
- A free [Convex](https://convex.dev) account (or a self-hosted Convex backend — see below)
- A free [Gemini](https://ai.google.dev) API key and/or [Groq](https://console.groq.com) API key (for transcription + AI verdicts)

### 1. Clone & install

```bash
git clone https://github.com/<your-username>/trust-lens.git
cd trust-lens
npm ci
```

### 2. Set up Convex

```bash
npx convex dev
```

- Log in when prompted and select/create a project.
- This starts the backend, pushes the schema, and generates types in `src/convex/_generated/`.
- Copy the displayed deployment URL (or grab it from the Convex dashboard).

> **Prefer to run your own backend instead of Convex Cloud?** Trust Lens works
> unmodified against a locally self-hosted Convex backend — see
> [Self-hosting Convex](https://github.com/get-convex/convex-backend/tree/main/self-hosted)
> for the Docker Compose setup, then point `.env.local` at your local
> `CONVEX_SELF_HOSTED_URL` / `CONVEX_SELF_HOSTED_ADMIN_KEY`.

### 3. Configure environment

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `VITE_CONVEX_URL` | ✅ | Your Convex deployment URL, e.g. `https://happy-otter-123.convex.cloud` |
| `CONVEX_SITE_URL` | ✅ | Backend HTTP action origin, e.g. `https://your-deployment.convex.site`; configure in the Convex environment |
| `SITE_URL` | ✅ | Frontend origin, e.g. `http://localhost:5173`; configure in the Convex environment |
| `CONVEX_DEPLOYMENT` | dev | Deployment slug used by `npx convex dev` |

> Keep signing keys (`JWKS`, `JWT_PRIVATE_KEY`) in the Convex environment.
> Set `SITE_URL` to your frontend origin; it is separate from the backend's
> `CONVEX_SITE_URL`.

### 4. Add the AI provider keys (backend env)

The AI features read these from the **Convex environment**, not the frontend:

```bash
npx convex env set GEMINI_API_KEY AI...
npx convex env set GROQ_API_KEY gsk_...
```

Email sign-in requires `OTP_EMAIL_API_KEY` in the Convex environment for the
Freebuff OTP delivery service. Obtain a new key from that provider; the old
source-embedded key must be revoked and replaced. Anonymous sign-in does not
require an email key. Circle emails require `RESEND_API_KEY` and
`RESEND_FROM_EMAIL` (a sender on a verified Resend domain).

Before deploying this revision, review existing records against `schema.ts`:
schema validation is now enabled. New session IDs remain optional on historical
call records. The new `circleAlerts` table and session indexes support one alert
per session. Run `npx convex deploy` only after configuring the backend keys and
resolving any existing schema-validation errors; do not delete historical data
to bypass validation.

Without these keys the app still works — heuristics, the knowledge base, and
team reports score every number/message — but AI transcription and LLM
verdicts show a friendly "configure me" hint instead.

### 5. Run it

```bash
npm run dev          # start the app (http://localhost:5173)
npx convex dev      # keep the backend running (separate terminal)
```

Open http://localhost:5173 → sign in (email OTP or anonymous) → try **Live Guard → Scenario call**, then check a number in **Number Check**.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check + production build (`tsc -b && vite build`) |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint across the project |
| `npm test` | Offline regression tests for privacy, alerts, scoring and audio queues |
| `npm run format` | Prettier formatting |
| `npx convex dev` | Run Convex backend + regenerate types |
| `npx convex deploy` | Deploy backend functions to production |

CI runs `npm ci`, lint, tests and the production build. Tests mock AI and email
providers and do not send real messages. Live microphone sessions drain queued
audio before their final verdict and archive. Transcript archiving defaults to
off in both microphone and upload checks; the backend also enforces this choice.

---

## Project structure

```
src/
├── components/
│   ├── dashboard/        # Overview, LiveGuard, MessageCheck, NumberCheck, History, Settings
│   └── ui/               # shadcn/ui primitives
├── convex/               # Backend — schema, auth, actions, mutations, queries
│   ├── analyze.ts        # Groq Whisper transcription + LLM verdict ("use node" actions)
│   ├── messageCheck.ts   # Message screening: Gemini (primary) → Groq (fallback)
│   ├── numberLookup.ts   # Number screening: heuristics + seed KB + reports + Groq
│   ├── calls.ts          # Call ledger CRUD
│   ├── circle.ts         # Alert circle CRUD
│   ├── numbers.ts        # Number reports + check history
│   ├── messages.ts       # Message check history + signal scoring
│   ├── alerts.ts         # Circle notification on flagged verdicts
│   ├── settings.ts       # Per-user protection settings
│   └── schema.ts         # callLogs, trustedCircle, userSettings, numberReports, numberChecks, messageChecks
├── hooks/                # use-auth, use-mobile
├── lib/                  # numbers.ts, messages.ts, trustlens.ts, gemini.ts, groq.ts, voice-analysis.ts
└── pages/                # Landing, Auth, Dashboard, NotFound
```

---

## Security notes before you push

- `.env.local` holds your Convex deployment URL — fine for local dev, but
  never commit it. It's already in `.gitignore`.
- Real API keys (`GEMINI_API_KEY`, `GROQ_API_KEY`) live only in the Convex
  environment (`npx convex env set …`), never in the repo or the client
  bundle.
- Double-check for any personal recovery codes, credentials, or other
  one-off files sitting in the project root before your first commit —
  they won't be caught by `.gitignore` unless you added them there.

## Roadmap

- [x] MVP — live voice check, number screening desk, message check, call ledger, alert circle
- [ ] **Phone call interception** — Android call-screen audio tap (not implemented; today screening uses the microphone or an uploaded file)
- [ ] SMS notifications for the trusted circle
- [ ] Hosted on-device classifier relay (Groq) for borderline voices
- [ ] Native Android app

## Contributing

Contributions are welcome. Please open an issue first to discuss the change, then submit a PR. Keep it simple, keep it typed.

## License


---

<div align="center">
<sub>Built to protect the ones who raised us. ❤️</sub>
</div>
