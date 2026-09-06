# Trust Lens — Engineering Guidelines

These are the working rules for building Trust Lens. Follow them for every change.

---

## 1. Product Rules
1. **Verdict-first UI.** Users (especially elderly) must understand a verdict in ≤2 seconds: big stamp, plain words, an action ("Call Rohan to verify").
2. **Never alarm without a path.** Every alert includes exactly one next action. No dead-end warnings.
3. **Privacy by default.** On-device analysis first; transcripts stored only on opt-in; deletion is always one tap away.
4. **Humility.** Trust Lens is an aid, not proof. No claims of 100% accuracy anywhere in the UI or copy.

## 2. Frontend Rules
- Keep the Freebuff template shell: `src/main.tsx`, `ConvexAuthProvider`, `RequireAuth` on `/dashboard`, `redirectAfterAuth="/dashboard"`.
- All routes: `/` (landing), `/auth`, `/dashboard`. Dashboard is the single authenticated surface with internal tabs.
- Reuse shadcn/ui components (`Button`, `Card`, `Badge`, `Switch`, `Slider`, `Tabs`, `Dialog`, `Accordion`, `Input`, `Textarea`, `Separator`, `Skeleton`, `ScrollArea`, `Avatar`, `DropdownMenu`). Add new UI files only when truly needed.
- Styling: Tailwind utilities only; theme tokens live in `src/index.css`. Do not remove Tailwind directives or root layout classes.
- Mobile-first: bottom nav below `md`, sidebar above; touch targets ≥ 44 px; text ≥ 14 px for body.
- Motion: Framer Motion for entrances/transitions; CSS keyframes for pulses. Keep it tasteful — this is a calm, archival aesthetic.
- No `console.log` in shipped code paths (auth screens may keep minimal logging for diagnostics).

## 3. Design System (Clean & Bold)
- Palette (CSS vars in `index.css`): near-white surfaces, ink text, indigo `--primary`, violet accent tones, and semantic emerald/amber/rose for safe / suspicious / flagged verdicts.
- Type: **Inter** for UI, **Space Grotesk** (`font-display`) for bold headings, **IBM Plex Mono** for data labels, verdict codes, timestamps.
- Texture: soft indigo page tints (`.paper`, `.paper-heavy`); white cards with rounded-2xl corners and hairline borders; gradient indigo→violet hero panels.
- Details: pill verdict chips, rounded filter chips, letter-spaced micro labels, bold tabular stat numerals, `font-display` headlines with tight tracking.
- **No** loud retro gimmicks, sepia/aged-paper effects, serif display type, or dated gradient abuse.

## 4. Backend Rules (Convex)
- Schema lives in `src/convex/schema.ts`; every new table scoped by `userId` and indexed.
- All queries/mutations authorize via `getAuthUserId(ctx)` and return `null`/throw for unauthenticated callers.
- Run `bun convex dev --once && bun tsc -b --noEmit` after any change under `src/convex/` (regenerates `_generated`). Never hand-edit `_generated`.
- No secrets on the client. Phase-2 Groq/SMS keys live in `process.env` inside `"use node"` actions only.

## 5. Data Rules
- `callLogs` transcript is **opt-in** — the simulator asks before saving transcript text; scores/verdicts always save.
- Verdict thresholds (TRD §4.3): `flagged ≥ 70`, `suspicious ≥ 40`, else `safe`. Do not drift silently; update TRD when thresholds change.

## 6. Verification Checklist (every change)
- [ ] `bun tsc -b --noEmit` passes (platform also runs it).
- [ ] `bun convex dev --once` passes when `src/convex/` changed.
- [ ] Landing CTAs reach `/auth?returnTo=...`; sign-in lands on the intended destination, never loops to `/`.
- [ ] Mobile layout spot-check at 375 px width.
- [ ] No blank preview: `src/index.css` global imports and root layout classes intact.
