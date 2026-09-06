"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import axios from "axios";
import { action, type ActionCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  KNOWN_SCAM_NUMBERS,
  normalizeNumber,
  NUMBER_PATTERNS,
  prettyNumber,
  seedWeight,
  THRESHOLD_FLAGGED,
  THRESHOLD_SUSPICIOUS,
  VERDICT_RANK,
} from "../lib/numbers";
import type { Verdict } from "../lib/trustlens";
import { GROQ_CHAT_URL, GROQ_TEXT_MODEL, stripJsonFences } from "../lib/groq";

const VERDICTS = ["safe", "suspicious", "flagged"] as const;

const verdictFromScore = (score: number): Verdict =>
  score >= THRESHOLD_FLAGGED
    ? "flagged"
    : score >= THRESHOLD_SUSPICIOUS
      ? "suspicious"
      : "safe";

/** Full screening-desk lookup: heuristic patterns + seed knowledge base +
 *  team reports + a Groq second opinion. Records the check afterwards.
 *  Never throws — runtime failures come back as `{ ok: false }` so the UI
 *  can show exactly what went wrong. */
export const lookup = action({
  args: { number: v.string() },
  handler: async (ctx, args) => {
    try {
      return await lookupNumber(ctx, args.number);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      return {
        ok: false,
        message: `The lookup failed — ${detail}`,
      };
    }
  },
});

async function lookupNumber(ctx: ActionCtx, raw: string) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not authenticated");
  }
  const normalized = normalizeNumber(raw);
  if (normalized.length < 10 || normalized.length > 12) {
    return {
      ok: false,
      message:
        "That doesn't look like a valid phone number — enter 10 to 12 digits (e.g. 98765 43210).",
    };
  }
  const display = prettyNumber(raw);

  const reasons: string[] = [];

  // 1) Heuristic patterns.
  let patternRisk = 0;
  for (const p of NUMBER_PATTERNS) {
    if (p.test(normalized)) {
      patternRisk += p.weight;
      reasons.push(p.label);
    }
  }

  // 2) Seed knowledge base. A known entry takes the higher of the generic
  //    pattern score and its own severity weight — never both — so the
  //    verdict can't contradict the severity the seed was listed with.
  const seed = KNOWN_SCAM_NUMBERS.find((s) => s.number === normalized);
  if (seed) {
    reasons.push(`Knowledge base: ${seed.label}`);
  }
  let risk = seed
    ? Math.max(patternRisk, seedWeight(seed.severity))
    : patternRisk;

  // 3) Community reports (deduped by user).
  // The generated `api` object includes this action itself, so referencing
  // `api.numbers.*` here would create a type-level cycle. Call through a
  // narrowly-typed string reference instead.
  const runQuery = ctx.runQuery as unknown as (
    fn: string,
    args: { number: string },
  ) => Promise<Doc<"numberReports">[] | null>;
  const reports =
    (await runQuery("numbers:reportsForNumber", { number: normalized })) ?? [];
  const reporterIds = new Set(reports.map((r) => r.userId));
  if (reporterIds.size > 0) {
    risk += Math.min(40, reporterIds.size * 12);
    const cats = [...new Set(reports.map((r) => r.category).filter(Boolean))];
    reasons.push(
      `${reporterIds.size} teammate report${reporterIds.size > 1 ? "s" : ""}` +
        (cats.length ? ` — ${cats.join(", ")}` : ""),
    );
  }

  risk = Math.max(0, Math.min(100, risk));
  const heuristicVerdict = verdictFromScore(risk);
  const apiKey = process.env.GROQ_API_KEY;

  // 4) Groq second opinion (degrades gracefully when the key is missing).
  let ai: {
    verdict: Verdict;
    confidence: number;
    explanation: string;
    markers: string[];
  } | null = null;
  if (apiKey) {
    ai = await groqNumberOpinion(apiKey, {
      display,
      normalized,
      risk,
      reasons,
      reports: reports.map((r) => ({
        category: r.category,
        note: r.note ?? null,
      })),
    });
  }

  const verdict =
    ai && VERDICT_RANK[ai.verdict] > VERDICT_RANK[heuristicVerdict]
      ? ai.verdict
      : heuristicVerdict;
  const confidence = ai
    ? ai.confidence
    : heuristicVerdict === "flagged"
      ? risk
      : Math.round(risk * 0.8);

  const runMutation = ctx.runMutation as unknown as (
    fn: string,
    args: {
      number: string;
      display: string;
      riskScore: number;
      verdict: Verdict;
      reasons: string[];
      createdAt: number;
    },
  ) => Promise<unknown>;
  await runMutation("numbers:recordCheck", {
    number: normalized,
    display,
    riskScore: risk,
    verdict,
    reasons: reasons.slice(0, 6),
    createdAt: Date.now(),
  });

  return {
    ok: true,
    number: normalized,
    display,
    riskScore: risk,
    heuristicVerdict,
    verdict,
    confidence,
    reasons: reasons.slice(0, 6),
    reports: reports.map((r) => ({
      category: r.category,
      note: r.note ?? null,
      createdAt: r.createdAt,
    })),
    ai,
    groqConfigured: Boolean(apiKey),
  };
}

async function groqNumberOpinion(
  apiKey: string,
  ctx: {
    display: string;
    normalized: string;
    risk: number;
    reasons: string[];
    reports: { category: string; note: string | null }[];
  },
): Promise<{
  verdict: Verdict;
  confidence: number;
  explanation: string;
  markers: string[];
} | null> {
  const reportText =
    ctx.reports.length > 0
      ? ctx.reports
          .map((r) => `- ${r.category}${r.note ? ` — “${r.note}”` : ""}`)
          .join("\n")
      : "No team reports yet.";

  const systemPrompt = `You are Trust Lens, a phone-number screening analyst for an internal fraud-detection team.\n\nGiven a phone number and the signals gathered about it, judge how likely this number is a scam or spam source. Consider:\n- 140-series ranges (TRAI-designated for unregistered telemarketing / UCC spam).\n- Repeated or sequential digit patterns — typical of burner SIMs and spoofed lines.\n- Team reports and their categories (fraud call, voice-clone attempt, WhatsApp scam, SMS phishing, telemarketing).\n- Legitimate businesses rarely show these signals; an unknown private number with no signals is merely unverified, not guilty.\n\nBe calibrated, never alarmist. Respond with STRICT JSON only, no markdown, in exactly this shape:\n{"verdict":"safe" | "suspicious" | "flagged","confidence":<0-100 integer>,"explanation":"<2-3 sentence plain-language explanation>","markers":["<one short finding per item>"]}\n\nRules:\n- "flagged" when there are clear fraud signals (reported fraud, known telemarketing range, patterned burner number).\n- "suspicious" for soft signals worth a second look.\n- "safe" when nothing stands out — an unremarkable number is not evidence of fraud.`;

  const userPrompt = [
    `Number: ${ctx.display} (digits ${ctx.normalized})`,
    `Heuristic risk score: ${ctx.risk}/100`,
    ctx.reasons.length
      ? `Signals:\n${ctx.reasons.map((r) => `- ${r}`).join("\n")}`
      : "Signals: none beyond the number itself.",
    `Team reports:\n${reportText}`,
  ].join("\n\n");

  try {
    const { data } = await axios.post(
      GROQ_CHAT_URL,
      {
        model: GROQ_TEXT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: "json_object" },
      },
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(stripJsonFences(content)) as {
      verdict?: string;
      confidence?: number;
      explanation?: string;
      markers?: string[];
    };
    const verdict = VERDICTS.includes(parsed.verdict as (typeof VERDICTS)[number])
      ? (parsed.verdict as (typeof VERDICTS)[number])
      : "suspicious";
    return {
      verdict,
      confidence: Math.max(
        0,
        Math.min(100, Math.round(Number(parsed.confidence) || 0)),
      ),
      explanation: String(parsed.explanation ?? "").trim(),
      markers: Array.isArray(parsed.markers)
        ? parsed.markers.map(String).slice(0, 8)
        : [],
    };
  } catch {
    return null;
  }
}
