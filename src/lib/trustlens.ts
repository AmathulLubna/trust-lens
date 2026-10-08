/** safe/flagged remain readable only for historical and scripted records. */
export type Verdict =
  | "safe"
  | "flagged"
  | "suspicious"
  | "no_strong_indicators"
  | "inconclusive"
  | "analysis_unavailable"
  | "insufficient_audio";
export type FlagKind = "voice" | "behavior" | "contact";
export type Severity = "info" | "warning" | "critical";
export type Channel = "phone" | "unknown";

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
    label: "Legacy: no strong indicators",
    stamp: "Legacy result · identity unverified",
    tone: "text-slate-700 border-slate-400 bg-slate-50",
    bar: "bg-slate-500",
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
  no_strong_indicators: {
    label: "No strong indicators",
    stamp: "No strong indicators · identity unverified",
    tone: "text-slate-700 border-slate-400 bg-slate-50",
    bar: "bg-slate-500",
  },
  inconclusive: {
    label: "Inconclusive",
    stamp: "Inconclusive · verify independently",
    tone: "text-amber-700 border-amber-500 bg-amber-50",
    bar: "bg-amber-500",
  },
  analysis_unavailable: {
    label: "Analysis unavailable",
    stamp: "Analysis unavailable",
    tone: "text-amber-700 border-amber-500 bg-amber-50",
    bar: "bg-amber-500",
  },
  insufficient_audio: {
    label: "Not enough usable audio",
    stamp: "Not enough usable audio",
    tone: "text-amber-700 border-amber-500 bg-amber-50",
    bar: "bg-amber-500",
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

/* Language note: local Whisper transcribes selected or auto-detected languages; the same
 * spoken audio can come back as English, romanized Hinglish, OR Devanagari
 * script depending on the run. Every pattern below therefore needs a
 * Devanagari counterpart alongside the Latin-script one — matching only
 * Latin script silently zeroes out every marker (and the small-talk /
 * relation-claim checks that gate the verdict) the moment Whisper returns
 * Hindi-script text. Devanagari has no word-boundary \b support in JS
 * regex the way Latin scripts do, so Devanagari alternatives are matched
 * without \b anchors. */

const SMALL_TALK_RE =
  /\b(hello|hi|hey|namaste|good (morning|afternoon|evening)|how are you|how r u|how are u|kaise ho|kaisi ho|kya haal|all good|theek ho|fine|doing well)\b|(नमस्ते|नमस्कार|कैसे हो|कैसी हो|क्या हाल|सब ठीक|आप कैसे हैं|शुभ (सुबह|दोपहर|शाम))/i;

const RELATION_CLAIM_RE =
  /\b(i am|i'm|it is|it's|this is|bol rahi|bol raha)\b.{0,32}\b(amma|maa|mummy|mom|mother|papa|dad|father|beta|beti|son|daughter|bhai|brother|behen|sister|uncle|aunt|aunty)\b|(मैं|यह)\s?.{0,16}(हूं|हूँ|बोल रह[ीा] हूं|बोल रह[ीा] हूँ).{0,32}(अम्मा|माँ|मां|मम्मी|पापा|बाबा|बेटा|बेटी|भाई|बहन|अंकल|आंटी)|(अम्मा|माँ|मां|मम्मी|पापा|बाबा)\s?(बोल रह[ीा] हूं|बोल रह[ीा] हूँ|यहाँ|है)/;

export function normalizedTranscriptText(
  lines: TranscriptLine[] | string,
): string {
  const text =
    typeof lines === "string"
      ? lines
      : lines
          .filter((l) => l.speaker !== "you")
          .map((l) => l.text)
          .join(" ");
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text: string): number {
  return text ? text.split(/\s+/).length : 0;
}

export function isLowRiskSmallTalk(lines: TranscriptLine[] | string): boolean {
  const text = normalizedTranscriptText(lines);
  if (!text) return false;
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
    hasRelationClaim(lines) &&
    (has("emergency") || has("money") || has("otp") || has("secrecy"));
  return hasCritical || pressureAndRequest || impersonationPattern;
}

export function hasStrongVoiceEvidence(metrics?: VoiceEvidence): boolean {
  void metrics;
  return false; // Browser diagnostic features are not trained authenticity evidence.
}

export function calibrateVerdict(
  verdict: Verdict,
  flags: ScamFlag[],
  lines: TranscriptLine[] | string,
  metrics?: VoiceEvidence,
): Verdict {
  void metrics; // Browser diagnostics are not authenticity evidence.
  if (!normalizedTranscriptText(lines))
    return verdict === "flagged" || verdict === "suspicious"
      ? "suspicious"
      : "inconclusive";
  if (hasStrongScamEvidence(flags, lines)) return "suspicious";
  return verdict === "safe" ? "no_strong_indicators" : verdict;
}

/** Clause-local request rules. Contextual warnings, never authenticity scores. */
export function scamFlagsFromText(text: string): ScamFlag[] {
  const clauses = text
    .normalize("NFC")
    .toLowerCase()
    .split(/[.!?।;\n]+|\b(?:but|however|and)\b| और /iu);
  const found = new Map<string, ScamFlag>();
  for (let clause of clauses) {
    if (
      /\b(scam|scammer|example|warning|beware|education|lesson)\b|उदाहरण|सावधान|चेतावनी/u.test(
        clause,
      )
    )
      clause = clause.replace(/[“"]([^”"]*)[”"]/gu, " ");
    const advice =
      /(?:साझा|बताओ|भेजो)\s+(?:मत|नहीं)\s+(?:करें|करना)|\b(never|do not|don['’]?t|should not|must not)\s+(share|send|give|disclose|transfer|pay|provide)|\b(no need to|not asking (you )?to)\b|(?:ओटीपी|पासवर्ड|पैसे).{0,32}(?:मत|नहीं).{0,16}(?:बताओ|देना|दें|भेज|साझा)|(?:कभी|मत).{0,32}(?:ओटीपी|पासवर्ड).{0,32}(?:साझा|बताओ|बताएं|दें)/u.test(
        clause,
      );
    const add = (id: string, label: string, severity: Severity) =>
      found.set(id, { id: `mic-${id}`, label, kind: "behavior", severity });
    if (!advice) {
      if (
        /\b(send|transfer|pay|wire|deposit)\b.{0,50}(?:\b(money|rupees|payment|funds|upi|rs)\b|₹|\d)|\b(paise|paisa)\b.{0,20}\b(bhejo|bhejiye|transfer)\b|(?:पैसे|पैसा|रुपये|रुपए|राशि).{0,24}(?:भेजो|भेजिए|भेजें|ट्रांसफर|जमा)/u.test(
          clause,
        )
      )
        add(
          "money",
          "Money transfer requested — verify independently",
          "critical",
        );
      if (
        /(?:\b(share|tell|give|send|provide|disclose|enter)\b.{0,40}\b(otp|pin|password|code|card number|bank details|aadhaar)\b)|(?:\b(otp|pin|password)\b.{0,25}\b(batao|bhejo|share|send)\b)|(?:ओटीपी|पिन|पासवर्ड|बैंक विवरण|आधार).{0,24}(?:बताओ|भेजो|दो|दें|साझा)/u.test(
          clause,
        )
      )
        add("otp", "Credential disclosure requested", "critical");
      if (
        /\b(authorize|approve|change)\b.{0,40}\b(beneficiary|payment|transfer|bank account)\b/u.test(
          clause,
        )
      )
        add(
          "approval",
          "Sensitive approval or beneficiary change requested",
          "critical",
        );
    }
    if (
      /\b(do not|don['’]?t) tell (anyone|them|papa|mom)|\b(keep (it|this) secret|just between us|mat batana)\b|किसी को (?:मत|नहीं) बता|मत बताना|गुप्त रखना/u.test(
        clause,
      )
    )
      add("secrecy", "Secrecy pressure", "warning");
    if (
      !advice &&
      /\b(urgent|immediately|jaldi|asap|right now|right away)\b|जल्दी|तुरंत|फौरन/u.test(
        clause,
      )
    )
      add("urgency", "Pressure to act now", "warning");
  }
  return [...found.values()];
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
