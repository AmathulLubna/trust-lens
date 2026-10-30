# TrustLens with Convex

> **LCU branch:** the shared VoiceSentinel setup is documented in
> [README.md](README.md). It runs through Convex to the operator's laptop without
> user pairing. The hosted Groq setup below still applies to transcript/scam
> features; references below to a paired local classifier describe the older
> standalone companion, not LCU's authenticated shared-model path.

Live Guard and Transcript & scam check use your Convex backend and hosted Groq
models. They need no Python installation, downloaded model, pairing key, or
VoiceSentinel server. The optional local classifier remains under Upload Check.
Hosted scam analysis and browser acoustic measurements cannot prove that a
voice is human or AI-generated.

## Run the current app

Use Node.js 24.15 or newer within a version supported by package.json.

```powershell
npm ci
npx convex dev --configure existing
```

Choose your existing TrustLens project. This writes the deployment name and
`VITE_CONVEX_URL` into `.env.local`. Keep that file private. If the project is
already linked, use `npm run dev:full` to sync the backend and start the app.
For a backend that is already synced, use `npm run dev` or double-click
`Start-TrustLens.cmd`. `Start-VoiceSentinel.cmd` is only for the optional local
classifier.

The ports are separate: TrustLens uses **5173** (fixed) and the VoiceSentinel
companion uses **8765**. To pair the optional local model, run
`Start-VoiceSentinel.cmd`, open <http://127.0.0.1:8765/pair>, click **Copy pairing
key**, and paste it in **Upload Check → Local voice model (optional) → Pairing
key from your laptop**. Click **Connect local detector**. Keep the companion
running; its key changes on restart. Live Guard does not need this key.

In the **same deployment's Convex dashboard → Settings → Environment Variables**,
set `GROQ_API_KEY`. Do not put provider secrets in `VITE_` variables; those are
public browser configuration. The live check tests backend configuration before
requesting microphone access. A configured key still needs valid Groq access
and available quota.

Convex Auth also needs its existing `JWT_PRIVATE_KEY` and `JWKS` configuration.
Keep the existing values when reconnecting a project. Set `SITE_URL` to the app's
origin (`http://localhost:5173` for development); Convex provides
`CONVEX_SITE_URL` for its HTTP actions. Guest sign-in is available. Email OTP
sign-in additionally needs `OTP_EMAIL_API_KEY` for the existing email provider.
Circle email alerts need `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL`.

## Use voice checks

1. Open the app, sign in or continue as a guest, and choose **Live Guard**.
2. Select the spoken language if known, then **Start new session** and allow
   microphone access. Use HTTPS or localhost in a current browser.
3. Speak into the microphone or put the call on speaker nearby. The web app
   captures the microphone; it cannot directly capture a phone call.
4. The app checks each six-second recording for speech before sending it to
   Convex. Silent chunks and brief clicks are skipped. Hosted transcription
   also filters segments with high no-speech probability, poor log probability,
   or excessive repetition using Groq's verbose segment metadata. These gates
   reduce silence hallucinations; very quiet or unclear speech may be skipped.
   The AI verdict refreshes as transcripts arrive.
5. **Pause** stops microphone capture. **End Check** finishes queued audio and
   saves the result to your ledger. Failed transcription or AI requests must
   succeed on retry before the app saves a final verdict. Transcripts are saved
   only if their archive switch is enabled. TrustLens does not store raw audio.

**Upload Check** defaults to the hosted transcript check. Files must be 8 MB or
smaller so their base64 representation fits within Convex's action argument
limit. The **Local voice model (optional)** tab retains the separate trained
VoiceSentinel classifier for users who explicitly want it.

**Live Guard → Live check mode → Local · VoiceSentinel AI voice check** uses the
trained local detector instead. Start `Start-VoiceSentinel.cmd`, copy the key
from `http://127.0.0.1:8765/pair`, connect, select v4 or v5, and choose **Start
local check**. Six-second speech samples go only to the loopback companion;
this mode makes no Groq transcription or verdict requests. Inference runs one
sample at a time, retaining only the newest waiting sample on slower laptops.
**Stop local check** releases the mic and finishes captured speech. The last
completed sample can then be saved or used for an explicit circle alert.
Results remain experimental/inconclusive and do not assess scam language.
Switching modes cancels the active check and releases the microphone.

Completed VoiceSentinel checks offer **Add to ledger**. AI-like votes also offer
**Add to ledger & alert circle**. Saving alone never sends an alert, even if
automatic live-call alerts are enabled. Saved results retain the model score,
threshold, duration, model vote and **Inconclusive** assessment; raw audio and
the laptop pairing key are not uploaded. Circle alerts require enabled contacts
with email addresses and Resend sender configuration. If email setup is
incomplete, the result is saved and the UI explains that no alert was sent.
You can retry later without creating duplicate ledger entries.

## Publish updates

```powershell
npm test
npm run typecheck:tests
npm run lint
npm run build
```

`npx convex dev --once` syncs the selected development deployment. Production is
separate: deploy backend changes with `npx convex deploy`, configure provider
keys in that production deployment, set the frontend host's `VITE_CONVEX_URL`
to the matching production URL, and rebuild/redeploy the frontend. Set that
deployment's `SITE_URL` to the production frontend origin.

References: [Convex environment variables](https://docs.convex.dev/production/environment-variables),
[Groq speech to text](https://console.groq.com/docs/speech-to-text).
