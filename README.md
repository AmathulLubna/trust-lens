<div align="center">

# 🔍 Trust Lens

### Real-time deepfake & scam-call detection for phone and WhatsApp voice

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
- **🔢 Number Check** — *Screening desk:* paste any number (missed call, SMS sender, WhatsApp contact) and get a risk verdict from pattern heuristics (TRAI 140-series UCC ranges, burner-SIM repeated digits, sequential/zero-heavy lines), the shared team knowledge base, and a Groq second opinion. Every lookup is recorded.
- **💬 Message Check** — Paste an SMS or WhatsApp message and get a verdict from heuristic signal scanning plus a Gemini (primary) / Groq (fallback) opinion, with the exact markers that drove the score.
- **📜 History Ledger** — Every screened call and check on record: verdict, risk score, markers, duration, and opt-in transcripts — filterable and clearable in one tap.
- **👥 Alert Circle** — A trusted team ("your family safety net"): when a call is flagged, the right people are notified automatically — with *who, when, and the verdict, never the transcript*.
- **⚙️ Settings** — Tune banner/vibration/full-screen interventions, sensitivity, and channels. Privacy by design: analysis runs on-device, transcripts are stored only on explicit opt-in, and your data never trains anyone's models.

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

- [Bun](https://bun.sh) ≥ 1.1 (the project is managed with Bun)
- A free [Convex](https://convex.dev) account (or a self-hosted Convex backend — see below)
- A free [Gemini](https://ai.google.dev) API key and/or [Groq](https://console.groq.com) API key (for transcription + AI verdicts)

### 1. Clone & install

```bash
git clone https://github.com/<your-username>/trust-lens.git
cd trust-lens
bun install
```

### 2. Set up Convex

```bash
bunx convex dev
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
| `CONVEX_SITE_URL` | ✅ | `http://localhost:5173` in dev (your deployed origin in production) |
| `CONVEX_DEPLOYMENT` | dev | Deployment slug used by `bunx convex dev` |

> Auth keys (`JWKS`, `JWT_PRIVATE_KEY`, `SITE_URL`) are auto-provisioned by
> Convex Auth — leave them to the platform/Convex dashboard.

### 4. Add the AI provider keys (backend env)

The AI features read these from the **Convex environment**, not the frontend:

```bash
bunx convex env set GEMINI_API_KEY AI...
bunx convex env set GROQ_API_KEY gsk_...
```

Without these keys the app still works — heuristics, the knowledge base, and
team reports score every number/message — but AI transcription and LLM
verdicts show a friendly "configure me" hint instead.

### 5. Run it

```bash
bun run dev          # start the app (http://localhost:5173)
bunx convex dev      # keep the backend running (separate terminal)
```

Open http://localhost:5173 → sign in (email OTP or anonymous) → try **Live Guard → Scenario call**, then check a number in **Number Check**.

### Useful scripts

| Command | What it does |
|---|---|
| `bun run dev` | Start the Vite dev server |
| `bun run build` | Type-check + production build (`tsc -b && vite build`) |
| `bun run preview` | Preview the production build |
| `bun run lint` | ESLint across the project |
| `bun run format` | Prettier formatting |
| `bunx convex dev` | Run Convex backend + regenerate types |
| `bunx convex deploy` | Deploy backend functions to production |

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
  environment (`bunx convex env set …`), never in the repo or the client
  bundle.
- Double-check for any personal recovery codes, credentials, or other
  one-off files sitting in the project root before your first commit —
  they won't be caught by `.gitignore` unless you added them there.

## Roadmap

- [x] MVP — live voice check, number screening desk, message check, call ledger, alert circle
- [ ] **Phone/WhatsApp call interception** — Android accessibility service / call-screen audio tap (Phase 2)
- [ ] SMS / WhatsApp Business notifications for the trusted circle
- [ ] Hosted on-device classifier relay (Groq) for borderline voices
- [ ] Native Android app

## Contributing

Contributions are welcome. Please open an issue first to discuss the change, then submit a PR. Keep it simple, keep it typed.

## License


---

<div align="center">
<sub>Built to protect the ones who raised us. ❤️</sub>
</div>
