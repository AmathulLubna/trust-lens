# Trust Lens — Technical Requirements Document (TRD)

**Version:** 1.0 · **Status:** Approved for build · **Date:** August 2026

---

## 1. System Architecture (Target — Phase 2)

```
┌──────────────────────────┐        ┌───────────────────────────────┐
│ Android (foreground svc) │        │ TrustLens Cloud (Convex)      │
│  AccessibilityService /  │───────▶│  ┌─────────────────────────┐  │
│  AudioRecord capture     │ stream  │  │ Auth (Convex Auth)     │  │
│  ┌────────────────────┐  │        │  ├─────────────────────────┤  │
│  │ Edge Audio Engine  │  │        │  │ Groq Relay (actions)   │  │
│  │  - VAD             │  │        │  │  - Whisper transcribe  │  │
│  │  - 400ms windows   │  │        │  │  - voice classifier    │  │
│  │  - pitch jitter    │  │        │  │  - LLM behavioral scan │  │
│  │  - spectral     │  │        │  ├─────────────────────────┤  │
│  │    artifacts       │  │        │  │ Convex DB              │  │
│  │  - prosody metrics │  │        │  │  - callLogs            │  │
│  └────────┬───────────┘  │        │  │  - trustedCircle       │  │
│           │ edge verdict │        │  │  - userSettings        │  │
│  ┌────────▼───────────┐  │        │  └─────────────────────────┘  │
│  │ Intervention Layer │◀─┼────────┤  Notifications → circle      │
│  │ banner + vibration │  │        │  (SMS/WhatsApp in Phase 2)   │
│  └────────────────────┘  │        └───────────────────────────────┘
└──────────────────────────┘
```

**Key principle:** 80% of the detection happens on-device (privacy, cost, latency).
Cloud is consulted only for (a) borderline voice classification, (b) behavioral LLM scan
of *transcripts the user opted into*, (c) ledger/circle persistence.

## 2. MVP (This Build) Architecture

The MVP is a **mobile-compatible web app** built on the Freebuff template:

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4 (shadcn/ui idioms), Framer Motion.
- **Backend/database:** Convex (reactive queries, mutations) — tables `callLogs`, `trustedCircle`, `userSettings`.
- **Auth:** Convex Auth (email OTP + anonymous guest), `RequireAuth`-protected dashboard.
- **Detection demo:**
  - **Call Simulator** — scripted scam call whose transcript streams in real time while both agents update live scores, ending in an intervention banner.
  - **Live Voice Check** — real microphone analysis via the **Web Audio API** (`AnalyserNode`):
    - Pitch tracking via autocorrelation (ACF) on 1024-sample windows.
    - **Jitter** = mean absolute deviation between successive pitch periods.
    - **Spectral tilt / high-frequency rolloff** via FFT magnitude bands (synthetic speech tends to have unnaturally flat prosody + band-limiting artifacts).
    - **Prosody flatness** = low variance of pitch over rolling windows.
    - These are composed into a demo `syntheticConfidence` (0–100). Clearly labeled a *demonstration*, not a certified classifier.

## 3. Data Model (Convex)

### `callLogs`
| field | type | notes |
|---|---|---|
| `userId` | `id("users")` | owner |
| `callerName` / `callerNumber` | string? | spoofable; stored for reporting |
| `channel` | `"phone" \| "whatsapp" \| "unknown"` | |
| `startedAt` / `endedAt` / `durationSec` | number? | |
| `verdict` | `"safe" \| "suspicious" \| "flagged"` | |
| `riskScore`, `voiceScore`, `behaviorScore` | number | 0–100 |
| `flags` | array of `{id,label,kind,severity}` | voice / behavior / contact |
| `transcript` | optional array `{speaker,text,t}` | opt-in only |
| `notifiedCircle` | boolean | |

Indexes: `by_user` (`userId`), `by_user_time` (`userId`,`startedAt`).

### `trustedCircle`
| field | type |
|---|---|
| `userId` | `id("users")` |
| `name`, `phone`, `relation` | string |
| `notifyOnFlag` | boolean |
| `addedAt` | number |

Index: `by_user`.

### `userSettings`
| field | type |
|---|---|
| `userId` | `id("users")` |
| `vibrationAlert`, `bannerAlert`, `fullscreenAlert` | boolean |
| `autoNotifyCircle` | boolean |
| `sensitivity` | 1 \| 2 \| 3 |
| `channelPhone`, `channelWhatsapp` | boolean |

Index: `by_user`.

## 4. Agent Specifications

### 4.1 Voice Authenticity Agent (edge-first)
- Window: 400 ms of voiced audio (VAD-gated), 16 kHz PCM.
- Features:
  - **Pitch jitter (%)** — higher in human speech (3–8%) than most TTS (<1.5%).
  - **Prosody flatness** — coefficient of variation of pitch; cloned speech is flatter.
  - **Spectral artifacts** — band-energy ratios; vocoder artifacts concentrate energy in low bands.
  - **Formant stability** — over-stable formants are a TTS signature.
- Fusion: weighted logistic score → `voiceScore`.
- If `45 ≤ voiceScore ≤ 65`: defer to Groq-hosted classifier (roadmap).

### 4.2 Behavioral Scam-Pattern Agent (LLM-assisted)
- Input: rolling transcript (≥2 utterances).
- Rule lexicon (fast path):
  - urgency: "right now", "immediately", "urgent", "jaldi"
  - money/UPI/OTP: "send money", "UPI", "OTP", "₹", "bank", "don't tell"
  - claimed relation: "beta/betaa", "mum/dad", "bhaiya", "I'm your uncle"
  - secrecy: "don't tell anyone", "keep it between us"
  - time pressure: "only 10 minutes"
- LLM path (roadmap): freeform reasoning over non-matching text.
- Output: `behaviorScore` + matched markers.

### 4.3 Verdict Fusion
```
riskScore = 0.55·voiceScore + 0.45·behaviorScore
verdict:
  riskScore ≥ 70  → flagged   (intervene + notify circle)
  riskScore ≥ 40  → suspicious (passive banner, no notify)
  else            → safe
```

## 5. API Surface (Convex)

| function | type | purpose |
|---|---|---|
| `calls:list` | query | ledger for current user |
| `calls:record` | mutation | persist a completed call |
| `calls:clear` | mutation | empty ledger |
| `circle:list` | query | trusted circle |
| `circle:add` | mutation | add member |
| `circle:remove` | mutation | remove member |
| `settings:get` | query | user settings (defaults if none) |
| `settings:update` | mutation | upsert settings |

All functions authorize against `getAuthUserId(ctx)`; every row is scoped to the
current user. No cross-user reads exist in the MVP.

## 6. Non-Functional Requirements

- **Latency:** simulator verdict ≤ 2 s of simulated speech; voice-check updates ≤ 250 ms/frame.
- **Mobile-first:** bottom navigation < 768 px, sidebar ≥ 768 px; touch targets ≥ 44 px.
- **Privacy:** transcript saved only on opt-in; ledger rows deletable.
- **Offline resilience:** dashboard reads cache-first via Convex reactive queries; simulator works offline (no network calls in the demo path).
- **Accessibility:** contrast ≥ 4.5:1 for body text; verdicts never conveyed by color alone (icon + text + vibration sim).

## 7. Risks & Mitigations
| risk | mitigation |
|---|---|
| Browser mic blocked / unavailable | graceful fallback message; simulator works without mic |
| Pitch detection noisy in WebContainer/VM | robust ACF with median smoothing; demo framing |
| False positives anger users | sensitivity setting, "safe" default bias |
| Abuse of stored transcripts | opt-in only, delete-anytime, never shared by default |

## 8. Build & Verification
- `bun convex dev --once && bun tsc -b --noEmit` after any `src/convex/*` change.
- `bun tsc -b --noEmit` for frontend-only changes (platform runs this automatically per turn).
- Manual pass: landing → auth (guest) → dashboard → simulator → ledger persists → circle add/remove → settings persist.
