import type { Verdict } from "./trustlens";

/* ─────────────────────────────────────────────────────────────
   Trust Lens — number screening library
   Shared by the Convex lookup action (backend scoring) and the
   screening desk UI (input hints, sample numbers).
   Pure TS — no browser APIs, so Convex can import it.
   ───────────────────────────────────────────────────────────── */

/** Categories a teammate can attach when reporting a number. */
export const REPORT_CATEGORIES = [
  { value: "scam-call", label: "Scam / fraud call" },
  { value: "voice-clone", label: "Voice-clone attempt" },
  { value: "whatsapp", label: "WhatsApp scam" },
  { value: "sms", label: "SMS phishing" },
  { value: "telemarketing", label: "Telemarketing / spam" },
  { value: "legit", label: "Legitimate interaction (unverified report)" },
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["value"];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  REPORT_CATEGORIES.map((c) => [c.value, c.label]),
);

/** Normalize to 12 digits with the Indian country code (91…). */
export function normalizeNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 11 && digits.startsWith("0"))
    return "91" + digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

/** Pretty "+91 70000 12345" form for display. */
export function prettyNumber(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) {
    return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  }
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  return raw.trim();
}

/** Accepts any 10–12 digit input; flags empty / nonsense. */
export function isValidNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 12;
}

/** Heuristic patterns with weight added to the risk score when matched. */
export interface NumberPattern {
  test: (digits: string) => boolean;
  label: string;
  weight: number;
}

// Number syntax cannot establish fraud. No digit-pattern risk heuristics.
export const NUMBER_PATTERNS: NumberPattern[] = [];

/** Compatibility type for historical number fixtures; no fixtures are active. */
export interface ScamNumberRecord {
  number: string;
  display: string;
  label: string;
  category: string;
  severity: "flagged" | "suspicious";
}

// No provenance-backed reputation source is configured.
export const KNOWN_SCAM_NUMBERS: ScamNumberRecord[] = [];

/** Map a seed/pattern verdict to a risk score contribution. These are the
 *  only contribution a seed entry needs to stand on its own: a "flagged"
 *  entry must clear the flagged threshold (70) alone, a "suspicious" entry
 *  the suspicious threshold (40) alone — so the result always matches the
 *  listed severity. */
export function seedWeight(severity: "flagged" | "suspicious"): number {
  return severity === "flagged" ? 72 : 44;
}

/** Severity rank used to fuse heuristic + AI verdicts. */
export const VERDICT_RANK: Record<Verdict, number> = {
  safe: 0,
  no_strong_indicators: 0,
  inconclusive: 0,
  analysis_unavailable: 0,
  insufficient_audio: 0,
  suspicious: 1,
  flagged: 2,
};

/** Risk thresholds shared by the screening desk. */
export const THRESHOLD_FLAGGED = 70;
export const THRESHOLD_SUSPICIOUS = 40;
