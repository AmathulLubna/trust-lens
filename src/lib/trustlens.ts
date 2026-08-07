export type Verdict = "safe" | "suspicious" | "flagged";
export type FlagKind = "voice" | "behavior" | "contact";
export type Severity = "info" | "warning" | "critical";
export type Channel = "phone" | "whatsapp" | "unknown";

export interface ScamFlag {
  id: string;
  label: string;
  kind: FlagKind;
  severity: Severity;
}

export interface TranscriptLine {
  speaker: "caller" | "you";
  text: string;
  t: number; // seconds from call start
}

export interface ScenarioLine {
  t: number;
  speaker: "caller" | "you";
  text: string;
  flag?: ScamFlag;
}

/** The scripted demonstration call — the classic Indian voice-clone script:
 *  a caller claiming to be a relative in sudden trouble, demanding money fast
 *  and in secret. */
export const SCENARIO: ScenarioLine[] = [
  {
    t: 1.0,
    speaker: "caller",
    text: "Beta? Beta, sunn lo… it's Amma! Amma bol rahi hoon!",
    flag: {
      id: "rel-claim",
      label: "Claims to be a relative — caller ID is an unknown number",
      kind: "contact",
      severity: "warning",
    },
  },
  {
    t: 2.8,
    speaker: "caller",
    text: "I had a terrible accident near the market. I'm at the hospital now.",
  },
  {
    t: 4.6,
    speaker: "caller",
    text: "The doctor says I need surgery right away. The payment has to be made now.",
    flag: {
      id: "urgency",
      label: "Urgency language — “right away”, “has to be made now”",
      kind: "behavior",
      severity: "warning",
    },
  },
  {
    t: 6.4,
    speaker: "caller",
    text: "Please send ₹40,000 to this UPI ID — I'll message you the number. Jaldi, beta.",
    flag: {
      id: "money",
      label: "Money / UPI transfer requested — ₹40,000",
      kind: "behavior",
      severity: "critical",
    },
  },
  {
    t: 8.2,
    speaker: "caller",
    text: "But please — don't tell Papa. He'll worry himself sick. Just between us, okay?",
    flag: {
      id: "secrecy",
      label: "Secrecy pressure — “don't tell Papa”",
      kind: "behavior",
      severity: "critical",
    },
  },
  {
    t: 10.4,
    speaker: "you",
    text: "Amma… hold on. Let me call you back on Papa's phone in two minutes.",
  },
];

export const SCENARIO_END_S = 12.5;

/** Verdict thresholds (see docs/TRD.md §4.3). */
export const THRESHOLD_FLAGGED = 70;
export const THRESHOLD_SUSPICIOUS = 40;

export const VERDICT_META: Record<
  Verdict,
  { label: string; stamp: string; tone: string; bar: string }
> = {
  safe: {
    label: "Safe",
    stamp: "Verified · safe",
    tone: "text-emerald-700 border-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-500 dark:bg-emerald-500/10",
    bar: "bg-emerald-500",
  },
  suspicious: {
    label: "Suspicious",
    stamp: "Review · uncertain",
    tone: "text-amber-700 border-amber-500 bg-amber-50 dark:text-amber-400 dark:border-amber-400 dark:bg-amber-500/10",
    bar: "bg-amber-500",
  },
  flagged: {
    label: "Flagged",
    stamp: "Flagged · high risk",
    tone: "text-red-700 border-red-500 bg-red-50 dark:text-red-400 dark:border-red-500 dark:bg-red-500/10",
    bar: "bg-red-500",
  },
};

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function todayLong(): string {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Deterministic-but-jittered voice score ramp for the simulator. */
export function voiceRamp(elapsed: number, seed: number): number {
  const noise =
    Math.sin(elapsed * 3.7 + seed) * 2.2 + Math.sin(elapsed * 9.1 + seed) * 1.1;
  const ramp = 30 + 6.4 * Math.pow(elapsed, 0.92) + noise;
  return Math.max(18, Math.min(91, Math.round(ramp)));
}

export function behaviorFromFlags(flags: ScamFlag[]): number {
  let score = 0;
  for (const f of flags) {
    if (f.kind !== "behavior" && f.kind !== "contact") continue;
    score += f.severity === "critical" ? 22 : f.severity === "warning" ? 14 : 6;
  }
  return Math.min(95, score);
}

export function riskFrom(voice: number, behavior: number): number {
  return Math.round(0.55 * voice + 0.45 * behavior);
}

export function verdictFromRisk(risk: number): Verdict {
  if (risk >= THRESHOLD_FLAGGED) return "flagged";
  if (risk >= THRESHOLD_SUSPICIOUS) return "suspicious";
  return "safe";
}

type VoiceEvidence = {
  confidence?: number;
  jitterPct?: number;
  flatness?: number;
  rolloff?: number;
};

const SMALL_TALK_RE =
  /\b(hello|hi|hey|namaste|good (morning|afternoon|evening)|how are you|how r u|how are u|kaise ho|kaisi ho|kya haal|all good|theek ho|fine|doing well)\b/i;

const RELATION_CLAIM_RE =
  /\b(i am|i'm|it is|it's|this is|bol rahi|bol raha)\b.{0,32}\b(amma|maa|mummy|mom|mother|papa|dad|father|beta|beti|son|daughter|bhai|brother|behen|sister|uncle|aunt|aunty)\b/i;

function normalizedTranscriptText(lines: TranscriptLine[] | string): string {
  const text =
    typeof lines === "string"
      ? lines
      : lines
          .filter((l) => l.speaker !== "you")
          .map((l) => l.text)
          .join(" ");
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function wordCount(text: string): number {
  return text ? text.split(/\s+/).length : 0;
}

export function isLowRiskSmallTalk(lines: TranscriptLine[] | string): boolean {
  const text = normalizedTranscriptText(lines);
  if (!text) return true;
  if (scamFlagsFromText(text).length > 0) return false;
  return wordCount(text) <= 18 && SMALL_TALK_RE.test(text);
}

export function hasRelationClaim(lines: TranscriptLine[] | string): boolean {
  return RELATION_CLAIM_RE.test(normalizedTranscriptText(lines));
}

export function hasStrongScamEvidence(
  flags: ScamFlag[],
  lines: TranscriptLine[] | string = "",
): boolean {
  const ids = new Set(flags.map((f) => f.id.replace(/^mic-/, "")));
  const has = (id: string) => ids.has(id);
  const hasCritical = flags.some((f) => f.severity === "critical");
  const pressureAndRequest =
    (has("urgency") || has("emergency") || has("secrecy")) &&
    (has("money") || has("otp"));
  const impersonationPattern =
    hasRelationClaim(lines) && (has("emergency") || has("money") || has("otp") || has("secrecy"));
  return hasCritical || pressureAndRequest || impersonationPattern;
}

export function hasStrongVoiceEvidence(metrics?: VoiceEvidence): boolean {
  if (!metrics) return false;
  const confidence = metrics.confidence ?? 0;
  if (confidence >= 88) return true;
  return (
    confidence >= 78 &&
    (metrics.jitterPct ?? 100) <= 1.2 &&
    (metrics.flatness ?? 0) >= 0.72 &&
    (metrics.rolloff ?? 0) >= 0.62
  );
}

export function calibrateVerdict(
  verdict: Verdict,
  flags: ScamFlag[],
  lines: TranscriptLine[] | string,
  metrics?: VoiceEvidence,
): Verdict {
  const strongScam = hasStrongScamEvidence(flags, lines);
  const strongVoice = hasStrongVoiceEvidence(metrics);
  const hasSoftMarkers = flags.length > 0 || hasRelationClaim(lines);

  if (isLowRiskSmallTalk(lines) && !strongVoice) return "safe";
  if (verdict === "flagged" && !strongScam && !strongVoice) {
    return hasSoftMarkers ? "suspicious" : "safe";
  }
  if (verdict === "suspicious" && !hasSoftMarkers && !strongVoice) {
    return "safe";
  }
  return verdict;
}

/** Scan a chunk of (transcribed) speech for classic social-engineering
 *  markers: money/UPI demands, OTP/payment asks, urgency, secrecy
 *  pressure, manufactured emergencies, and common scam bait. Used by the
 *  live mic pipeline to surface markers as the conversation happens. */
export function scamFlagsFromText(text: string): ScamFlag[] {
  const t = text.toLowerCase();
  const found = new Set<string>();
  const out: ScamFlag[] = [];
  const checks: Array<{
    re: RegExp;
    id: string;
    label: string;
    severity: Severity;
  }> = [
    {
      re: /send money|send rupees|transfer|rupay|rupees|rs\.? ?\d|₹/i,
      id: "money",
      label: "Money transfer requested",
      severity: "critical",
    },
    {
      re: /upi|otp|pin|password|bank (account|details)|card number|aadhaar/i,
      id: "otp",
      label: "Payment / OTP / identity details requested",
      severity: "critical",
    },
    {
      re: /urgent|right now|immediately|jaldi|asap|right away|now now/i,
      id: "urgency",
      label: "Urgency language — pressure to act now",
      severity: "warning",
    },
    {
      re: /don'?t tell|do not tell|secret|just between|mat batana|don'?t (inform|share|say)|nobody (else|knows)/i,
      id: "secrecy",
      label: "Secrecy pressure — “don't tell anyone”",
      severity: "critical",
    },
    {
      re: /accident|surgery|hospital|police|arrested|in trouble|emergency|trouble|kidnap/i,
      id: "emergency",
      label: "Manufactured emergency framing",
      severity: "warning",
    },
    {
      re: /kyc|lottery|prize|courier|parcel|fedex|refund|insurance|investment|double your|gift card|free gift/i,
      id: "bait",
      label: "Common scam bait (KYC / lottery / parcel)",
      severity: "warning",
    },
  ];
  for (const c of checks) {
    if (!found.has(c.id) && c.re.test(t)) {
      found.add(c.id);
      out.push({
        id: `mic-${c.id}`,
        label: c.label,
        kind: "behavior",
        severity: c.severity,
      });
    }
  }
  return out;
}

export function relationHints(relation: string): string {
  const r = relation.toLowerCase();
  if (r.includes("mother") || r.includes("amma") || r.includes("maa"))
    return "Amma";
  if (r.includes("father") || r.includes("papa") || r.includes("abba"))
    return "Papa";
  if (r.includes("son")) return "Beta";
  if (r.includes("daughter")) return "Beti";
  if (r.includes("brother")) return "Bhai";
  if (r.includes("sister")) return "Behen";
  return "Relative";
}
