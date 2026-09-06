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
  { value: "legit", label: "Legitimate — report as safe" },
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["value"];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  REPORT_CATEGORIES.map((c) => [c.value, c.label]),
);

/** Normalize to 12 digits with the Indian country code (91…). */
export function normalizeNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
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

export const NUMBER_PATTERNS: NumberPattern[] = [
  {
    // 140-XXXXXXX is TRAI's allocated range for unregistered telemarketing (UCC).
    test: (d) => d.startsWith("91140"),
    label: "140-series range — unregistered telemarketing / UCC spam",
    weight: 55,
  },
  {
    // All (or mostly) repeated digits — typical of burner SIMs.
    // NB: the backreference must be \2 — group 1 is the optional (91)?
    // prefix, group 2 is the digit. Using \1 makes the pattern vacuous
    // and match every number (see history: that shipped once, don't repeat).
    test: (d) => /^(91)?(\d)\2{9}$/.test(d) || /^(91)?(\d)\2{5}\d*\2+$/.test(d),
    label: "Repeated-digit number — typical of burner SIMs",
    weight: 45,
  },
  {
    // Straight runs like 1234567890 / 9876543210 — a real subscriber line
    // never gets issued a purely sequential number.
    test: (d) => {
      const t = d.slice(2);
      return t === "0123456789" || t === "9876543210" || t === "1234567890";
    },
    label: "Sequential digit pattern — rarely a real subscriber line",
    weight: 42,
  },
  {
    // Zero-heavy lines often used to mask spoofed caller ID.
    test: (d) => /^(91)?0000/.test(d) || /^(91)?0{3,}1/.test(d),
    label: "Zero-heavy number — often used to mask spoofed calls",
    weight: 26,
  },
];

/** Seed knowledge base shipped with the app — realistic reference entries
 *  so the screening desk is useful on day one. Grows with team reports. */
export interface ScamNumberRecord {
  number: string;
  display: string;
  label: string;
  category: string;
  severity: "flagged" | "suspicious";
}

export const KNOWN_SCAM_NUMBERS: ScamNumberRecord[] = [
  {
    number: "917000012345",
    display: "+91 70000 12345",
    label: "Courier / parcel fraud script",
    category: "scam-call",
    severity: "flagged",
  },
  {
    number: "917600098765",
    display: "+91 76000 98765",
    label: "KYC update scam",
    category: "scam-call",
    severity: "flagged",
  },
  {
    number: "911400123456",
    display: "+91 1400 123456",
    label: "Unregistered telemarketing (UCC) range",
    category: "telemarketing",
    severity: "suspicious",
  },
  {
    number: "919999900000",
    display: "+91 99999 00000",
    label: "Patterned number reported for UPI fraud",
    category: "voice-clone",
    severity: "flagged",
  },
  {
    number: "919200001111",
    display: "+91 92000 01111",
    label: "OTP / payment-details phishing",
    category: "sms",
    severity: "suspicious",
  },
  {
    number: "918000080000",
    display: "+91 80000 80000",
    label: "Repeated-digit line with spoofed caller ID",
    category: "scam-call",
    severity: "suspicious",
  },
];

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
  suspicious: 1,
  flagged: 2,
};

/** Risk thresholds shared by the screening desk. */
export const THRESHOLD_FLAGGED = 70;
export const THRESHOLD_SUSPICIOUS = 40;
