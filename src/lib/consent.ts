import { useSyncExternalStore } from "react";

/** Cookie / local-storage consent for Trust Lens.
 *  - "essential" is always on (sign-in session, remembering this choice).
 *  - "preferences" covers optional conveniences, e.g. remembering your theme.
 *  Trust Lens uses no advertising or analytics cookies. */
export type Consent = { v: 1; preferences: boolean; decidedAt: number };

const KEY = "tl-cookie-consent";
const EVENT = "tl-consent-change";
const OPEN_EVENT = "tl-consent-open";

function read(): Consent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Consent;
    return parsed?.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

let cached: Consent | null | undefined;
function snapshot(): Consent | null {
  if (cached === undefined) cached = read();
  return cached;
}

function subscribe(cb: () => void) {
  const handler = () => {
    cached = read();
    cb();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function useConsent(): Consent | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

export function getConsent(): Consent | null {
  return snapshot();
}

export function saveConsent(preferences: boolean) {
  const value: Consent = { v: 1, preferences, decidedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage blocked — choice lasts for this page view only */
  }
  cached = value;
  window.dispatchEvent(new Event(EVENT));
}

/** Re-open the consent dialog from anywhere (Settings, footer, privacy page). */
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onOpenCookieSettings(cb: () => void) {
  window.addEventListener(OPEN_EVENT, cb);
  return () => window.removeEventListener(OPEN_EVENT, cb);
}
