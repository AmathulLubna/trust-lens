"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import axios from "axios";
import { action, type ActionCtx } from "./_generated/server";
import {
  calibrateMessageVerdict,
  messageRiskFromSignals,
  messageSignalsFromText,
  verdictFromMessageRisk,
} from "../lib/messages";
import { GROQ_CHAT_URL, GROQ_TEXT_MODEL, stripJsonFences } from "../lib/groq";
import {
  GEMINI_TEXT_MODEL,
  geminiGenerateUrl,
  textFromGeminiResponse,
} from "../lib/gemini";
import { VERDICT_RANK } from "../lib/numbers";
import type { Verdict } from "../lib/trustlens";

const VERDICTS = ["safe", "suspicious", "flagged"] as const;

export const check = action({
  args: {
    sender: v.optional(v.string()),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      return await checkMessage(ctx, args.text, args.sender);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, message: `The message check failed - ${detail}` };
    }
  },
});

async function checkMessage(ctx: ActionCtx, text: string, sender?: string) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated");

  const trimmed = text.trim();
  if (trimmed.length < 2) {
    return { ok: false, message: "Paste the SMS, WhatsApp text, or message first." };
  }
  if (trimmed.length > 5000) {
    return { ok: false, message: "Keep the message under 5,000 characters for one check." };
  }

  const signals = messageSignalsFromText(trimmed, sender);
  const risk = messageRiskFromSignals(signals);
  const heuristicVerdict = verdictFromMessageRisk(risk);
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  let ai: {
    verdict: Verdict;
    confidence: number;
    explanation: string;
    markers: string[];
    provider: "gemini" | "groq";
  } | null = null;
  if (geminiKey) {
    ai = await geminiMessageOpinion(geminiKey, {
      sender: sender?.trim() || undefined,
      text: trimmed,
      risk,
      signals: signals.map((s) => s.label),
    });
  }
  if (!ai && groqKey) {
    ai = await groqMessageOpinion(groqKey, {
      sender: sender?.trim() || undefined,
      text: trimmed,
      risk,
      signals: signals.map((s) => s.label),
    });
  }

  const rawVerdict =
    ai && VERDICT_RANK[ai.verdict] > VERDICT_RANK[heuristicVerdict]
      ? ai.verdict
      : heuristicVerdict;
  const verdict = calibrateMessageVerdict(rawVerdict, trimmed, signals);
  const confidence =
    ai && verdict === ai.verdict
      ? ai.confidence
      : verdict === "flagged"
        ? Math.max(75, risk)
        : verdict === "suspicious"
          ? Math.max(45, Math.round(risk * 0.9))
          : Math.min(35, Math.round(risk * 0.8));
  const reasons = signals.map((s) => s.label).slice(0, 8);

  const runMutation = ctx.runMutation as unknown as (
    fn: string,
    args: {
      sender?: string;
      messagePreview: string;
      riskScore: number;
      verdict: Verdict;
      reasons: string[];
      createdAt: number;
    },
  ) => Promise<unknown>;
  await runMutation("messages:recordCheck", {
    sender: sender?.trim() || undefined,
    messagePreview: trimmed.slice(0, 180),
    riskScore: risk,
    verdict,
    reasons,
    createdAt: Date.now(),
  });

  return {
    ok: true,
    sender: sender?.trim() || null,
    textPreview: trimmed.slice(0, 240),
    riskScore: risk,
    heuristicVerdict,
    verdict,
    confidence,
    reasons,
    ai,
    groqConfigured: Boolean(geminiKey || groqKey),
    aiProvider: ai?.provider ?? null,
  };
}

const MESSAGE_SYSTEM_PROMPT = `You are Trust Lens, an SMS and chat scam analyst for Indian users.

Judge whether a pasted message is normal, suspicious, or a likely scam. Be calibrated: a random sender alone is not a scam. Short greetings and ordinary small talk are safe unless paired with money, OTP, impersonation, urgency, secrecy, suspicious links, or fake payment proof language.

Respond with strict JSON only:
{"verdict":"safe" | "suspicious" | "flagged","confidence":<0-100 integer>,"explanation":"<2-3 sentence explanation>","markers":["<short marker>"]}

Rules:
- "flagged" requires a concrete scam pattern such as OTP/PIN request, urgent money transfer, impersonation plus payment/link, secrecy pressure, or phishing bait.
- "suspicious" is for softer combinations worth verifying separately.
- "safe" is for ordinary conversation, legitimate informational messages, or unknown sender with no harmful ask.`;

function messageUserPrompt(ctx: {
  sender?: string;
  text: string;
  risk: number;
  signals: string[];
}): string {
  return [
    `Sender: ${ctx.sender ?? "unknown / not provided"}`,
    `Heuristic risk: ${ctx.risk}/100`,
    ctx.signals.length
      ? `Detected signals:\n${ctx.signals.map((s) => `- ${s}`).join("\n")}`
      : "Detected signals: none.",
    `Message:\n${ctx.text}`,
  ].join("\n\n");
}

async function geminiMessageOpinion(
  apiKey: string,
  ctx: {
    sender?: string;
    text: string;
    risk: number;
    signals: string[];
  },
): Promise<{
  verdict: Verdict;
  confidence: number;
  explanation: string;
  markers: string[];
  provider: "gemini";
} | null> {
  try {
    const { data } = await axios.post(geminiGenerateUrl(GEMINI_TEXT_MODEL, apiKey), {
      contents: [
        {
          role: "user",
          parts: [{ text: `${MESSAGE_SYSTEM_PROMPT}\n\n${messageUserPrompt(ctx)}` }],
        },
      ],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 500,
        responseMimeType: "application/json",
      },
    });
    const parsed = JSON.parse(stripJsonFences(textFromGeminiResponse(data))) as {
      verdict?: string;
      confidence?: number;
      explanation?: string;
      markers?: string[];
    };
    const verdict = VERDICTS.includes(parsed.verdict as (typeof VERDICTS)[number])
      ? (parsed.verdict as Verdict)
      : "suspicious";
    return {
      verdict,
      confidence: Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0))),
      explanation: String(parsed.explanation ?? "").trim(),
      markers: Array.isArray(parsed.markers)
        ? parsed.markers.map(String).slice(0, 8)
        : [],
      provider: "gemini",
    };
  } catch {
    return null;
  }
}

async function groqMessageOpinion(
  apiKey: string,
  ctx: {
    sender?: string;
    text: string;
    risk: number;
    signals: string[];
  },
): Promise<{
  verdict: Verdict;
  confidence: number;
  explanation: string;
  markers: string[];
  provider: "groq";
} | null> {
  try {
    const { data } = await axios.post(
      GROQ_CHAT_URL,
      {
        model: GROQ_TEXT_MODEL,
        messages: [
          { role: "system", content: MESSAGE_SYSTEM_PROMPT },
          { role: "user", content: messageUserPrompt(ctx) },
        ],
        temperature: 0.15,
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
      ? (parsed.verdict as Verdict)
      : "suspicious";
    return {
      verdict,
      confidence: Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0))),
      explanation: String(parsed.explanation ?? "").trim(),
      markers: Array.isArray(parsed.markers)
        ? parsed.markers.map(String).slice(0, 8)
        : [],
      provider: "groq",
    };
  } catch {
    return null;
  }
}
