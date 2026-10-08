# Regression and local-flow checks

`npm test` runs network-free policy, capture, queue, authentication-delivery and Convex regressions. All model scores in those tests are labeled fixtures. The optional `local-service.test.ts` is skipped by default.

## Real local service smoke test

Use only generated speech in a local service with a disposable database and test-only shared token. No email is sent. One Windows fixture can be generated with:

```powershell
Add-Type -AssemblyName System.Speech
$fixtureSpeaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$fixtureSpeaker.SetOutputToWaveFile("D:\trust-lens-main\output\generated-speech.wav")
$fixtureSpeaker.Speak("This is generated test speech for TrustLens. Please verify sensitive requests through a saved contact.")
$fixtureSpeaker.Dispose()
```

Start the independent website service from `D:\trust-lens-main\services\acoustic` after its setup (see its README). Use only website credentials; never run the app backend for these checks:

```powershell
$env:TRUSTLENS_WEB_SERVICE_TOKEN="regression-only-token"
# Set only when public checkpoints already exist in this website's own model cache:
$env:HF_HUB_OFFLINE="1"
$env:TRANSFORMERS_OFFLINE="1"
.\.venv\Scripts\python.exe -m uvicorn web_acoustic.main:app --host 127.0.0.1 --port 8876
```

Run from the web repository:

```powershell
$env:TRUSTLENS_LOCAL_E2E="1"
$env:TRUSTLENS_GENERATED_WAV="D:\trust-lens-main\output\generated-speech.wav"
npx vitest run tests/local-service.test.ts
Remove-Item Env:TRUSTLENS_LOCAL_E2E, Env:TRUSTLENS_GENERATED_WAV
```

It checks an authenticated `convex-test` binary upload, a real local acoustic/ASR response, separate evidence, transcript removal without consent, persisted history and storage deletion. It does not test deployed Convex authentication, Hindi recognition quality or classification accuracy.

## Browser harness

Run `npm run test:ui`, open `the printed server URL followed by `/tests/ui/index.html``, and use the visible fixture selector. It imports production screen components but replaces Convex hooks, authentication and upload responses. It never contacts the acoustic or email service. These fixtures are clearly labeled and are excluded from the production entry point.

The repair exercised Edge with Playwright CLI, using an oscillator-backed `MediaStream` in place of a physical microphone. Checks covered:

- Upload controls: processing consent required; transcript retention initially off; unavailable outcomes visible and expanded in history; opted-in Hindi transcript visible.
- Message input: `shopping`, `never share your OTP`, and `मुझे पैसे भेजो`.
- Microphone capture: six-second AudioWorklet emission, partial-buffer flush, finalization, restart and immediate stop; timestamps and per-segment evidence displayed. A later replay checked the bounded transfer implementation.
- Script labels and exclusion notice; number observations without sourced reputation; settings preferences; clear-history confirmation and empty-state refresh.
- Landing page at 390 × 844 CSS pixels, with no horizontal overflow; browser error-console check.

Screenshots remain under ignored `output/playwright/`. Temporary CLI snapshots are under ignored `.playwright-cli/`. The browser harness supplements the server regressions; it is not evidence of a deployed end-to-end flow or physical-device recording coverage.
