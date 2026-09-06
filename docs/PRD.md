# Trust Lens — Product Requirements Document (PRD)

**Version:** 1.0 · **Status:** Approved for build · **Date:** August 2026
**Platform:** Mobile-compatible web app (PWA-ready), with Android-native audio interceptor as a Phase-2 roadmap item.

---

## 1. Problem Statement

AI voice-cloning scams are exploding across India. Attackers capture 3–10 seconds of a
relative's voice (often scraped from social media or WhatsApp statuses) and call family
members claiming a fabricated emergency — *"Beta, main musibat mein hoon, paise bhejo"* —
using a convincing clone of a loved one's voice. Elderly users are the primary victims
because they trust familiar voices and are unfamiliar with the technology.

**No consumer-facing defense exists today.** Caller ID spoofing is the only thing users
are told to check, and it does not help when the *voice itself* is fake.

## 2. Vision

> **Trust Lens listens so no voice is trusted on faith alone.** A real-time, on-call sentry
> that detects synthetic voices and scam conversation patterns before money moves.

## 3. Target Users

| Persona | Description | Primary need |
|---|---|---|
| **The Elder (primary user)** | 55+, owns a smartphone, uses WhatsApp daily, relies on phone calls with family | An alert they can understand in 2 seconds, in their language |
| **The Adult Child (family safety net)** | 25–45, tech-comfortable, financially independent | Trusted-circle alerts when a parent is targeted |
| **The Concerned Spouse** | May be primary or secondary user | Same as Elder, plus shared protection |

## 4. Goals & Non-Goals

### Goals
- Detect synthetic (TTS / voice-cloned) speech on live calls in **< 2 seconds**.
- Detect social-engineering patterns (urgency, money/OTP requests, claimed-but-unfamiliar relations) in parallel.
- Intervene mid-call with an unmissable but calm warning that tells the user *what to do*.
- Provide a **trusted circle** so one flagged call notifies family automatically.
- Run mostly **on-device/edge** to respect privacy and cost; use hosted inference (Groq) for heavy classifier tasks.

### Non-Goals (this release)
- Android accessibility-service audio interception (Phase 2, documented in TRD).
- WhatsApp *call audio* interception (blocked by OS; Phase 2 uses Android's audio capture APIs where permitted).
- Guaranteed 100% accuracy — TrustLens is a *warning system*, not a court of evidence.
- Replacement of the user's judgment or bank's fraud systems.

## 5. Personas in Action (Primary Flow)

1. **Maya (68)** receives a call from a number labeled "Mum." The voice says: *"Beta, I had an accident, I need ₹40,000 for the hospital — send it to this UPI ID right now, don't tell Dad."*
2. Within ~1.5s, TrustLens' **Voice Agent** detects prosody flatness + spectral artifacts consistent with a voice clone (87% synthetic confidence).
3. In parallel, the **Behavioral Agent** flags: urgency, money request, UPI/OTP pressure, claimed relation.
4. TrustLens shows a banner: **"Possible voice clone + urgency scam pattern detected. Verify separately before sending money."** The phone vibrates in a distinct double-pulse.
5. TrustLens auto-notifies **Rohan (son)** via the trusted circle.
6. Maya ends the call, calls Rohan, confirms her mother is fine, and reports the number. The call is archived in the Call Ledger.

## 6. Feature Requirements

### FR-1 — Live Call Screening (simulated in web MVP, real in Phase 2)
- R1.1 The system analyzes live audio in windows of ~400 ms, maintaining a rolling synthetic-voice score.
- R1.2 Voice score updates in real time; a verdict can be issued within 2 seconds of speech onset.
- R1.3 Channels: phone calls and WhatsApp voice calls.

### FR-2 — Voice Authenticity Agent
- R2.1 Edge features computed locally: pitch-jitter, spectral artifacts, prosody flatness, formant stability.
- R2.2 Hosted lightweight classifier (Groq-hosted Whisper + small classifier) for second opinion when confidence is borderline.
- R2.3 Outputs `voiceScore` (0–100) and a human-readable explanation.

### FR-3 — Behavioral Scam-Pattern Agent
- R3.1 Live (partial) transcription of the conversation.
- R3.2 Rules + LLM classification of markers: urgency language, money/UPI/OTP requests, claimed-but-unverified relations, secrecy pressure ("don't tell anyone"), time pressure.
- R3.3 Outputs `behaviorScore` (0–100) and a list of matched markers.

### FR-4 — Intervention Layer
- R4.1 Mid-call banner with combined verdict: "Possible voice clone + urgency scam pattern detected."
- R4.2 Distinct vibration pattern; optional full-screen takeover for critical verdicts.
- R4.3 Action guidance: "Verify via a separate channel before acting" + one-tap "Verify now" that opens the dialer/WhatsApp to a *known* trusted number (never the caller).

### FR-5 — Family Safety Net (Trusted Circle)
- R5.1 User maintains a trusted circle of family members (name, phone, relation).
- R5.2 On `flagged` verdict, circle members with `notifyOnFlag` are notified (SMS/WhatsApp in Phase 2; in-app alert in web MVP).
- R5.3 Circle members can see a minimal, privacy-preserving alert: who, when, verdict — never the full transcript without consent.

### FR-6 — Call Ledger
- R6.1 Every screened call is archived: verdict, scores, flags, transcript (opt-in), duration, channel.
- R6.2 Ledger supports filtering and sharing a "dossier" with the family/authorities (e.g., cyber-crime helpline 1930).

### FR-7 — Settings
- R7.1 Toggles: vibration, banner, full-screen alert, trusted-circle auto-notify.
- R7.2 Sensitivity: Standard / High (fewer false negatives, more alerts).
- R7.3 Channel toggles: phone, WhatsApp.
- R7.4 Language preference (Hindi, Tamil, Telugu, Bengali, English — roadmap).

## 7. Success Metrics

| Metric | Target (12 months post-launch) |
|---|---|
| Time-to-verdict on live calls | < 2 s |
| Detection recall on curated voice-clone corpus | > 90% at "flagged" threshold |
| False-positive rate (real family calls) | < 3% |
| % flagged calls where user verified separately | > 60% (survey) |
| Money loss reported prevented | tracked via user reports |

## 8. Compliance & Ethics
- DPDP Act (India) readiness: on-device processing by default; transcripts stored only with explicit consent; deletion available.
- Telemarketing-call regulations (TRAI) do not prohibit call *screening* on the receiver's device.
- Clear labeling that TrustLens is an aid, not evidence; no public shaming of flagged callers (the number may be a spoofed innocent).

## 9. MVP Scope vs Roadmap

**In MVP (this build):**
- Web-app experience: clean, bold dashboard (internal team tool), live-call simulator, real microphone voice analysis demo (Web Audio API), call ledger, alert circle, settings — all behind auth, data persisted via Convex.

**Phase 2:**
- Android app with AccessibilityService audio tap + foreground service.
- WhatsApp call audio via Android capture APIs (where permitted).
- Groq-hosted classifier + Whisper transcription integration.
- SMS/WhatsApp notifications to trusted circle.
- Hindi + regional-language support.

## 10. Open Questions
- Which states/helplines to partner with first (1930 cyber-crime helpline).
- Whether telecoms (Jio/Airtel) want a carrier-side integration.
- Pricing: free tier (personal) vs family plan.
