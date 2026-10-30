# CodeRabbit review — 30 October 2026

Fixes finalized on 31 October 2026 (Asia/Calcutta).

Scope: committed `LCU` changes against `main`, reviewed with CodeRabbit CLI
0.9.1 (`coderabbit review --agent -t committed --base main`). The review
completed across 111 changed files and raised **2 minor issues**; no major or
critical issues were reported. This is a review result, not a guarantee that
the code has no other defects.

## Fixes

1. **Shared audio processing disclosure** — `src/pages/Privacy.tsx` now explains
   that the shared VoiceSentinel modes send audio through Convex and Cloudflare
   to the operator's laptop. It lists those recipients, temporary decoding files,
   and roughly 15-minute retention of derived features and results. The wording
   was checked against the reused `ml/voice_sentinel/local_service.py`: decoding
   does write a temporary file, so an exclusively in-memory claim would be wrong.
   Saved ledger results are distinguished from temporary processing data.
2. **Draft Firestore ownership rules** — the Git-tracked `FIREBASE_MIGRATION.md`
   examples for call logs, trusted-circle members, number checks and message
   checks now separate read/delete from update. Updates require the current
   owner and an unchanged `userId`, preventing an owner from moving a record
   into another user's data. Create rules remain unchanged. This document was
   already deleted in the local workspace; its corrected version was staged
   directly in Git without restoring the local file or committing that deletion.
   TrustLens still uses Convex; no Firebase rules were deployed.

## Validation and deployment

Before changes: all 65 JavaScript/TypeScript tests and all 10 LCU Python tests
passed, along with lint, both additional TypeScript checks and the production
build. These fixes change explanatory text and draft rules only. No model
weights, credentials, runtime configuration or live Convex deployment changed.
The gateway and tunnel remain stopped. Work stays on `LCU`; `main` is untouched.

After fixes: lint and the production build passed again; Git whitespace checks
passed. The four draft-rule replacements were checked to ensure `userId` stays
immutable on update and the existing local file deletion remains intact. No
Firebase emulator test was run because this is an unused migration draft, not
the deployed Convex authorization implementation.
