"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import axios from "axios";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  calibrateVerdict,
  isLowRiskSmallTalk,
  type ScamFlag,
  type Severity,
  type TranscriptLine,
  type Verdict,
} from "../lib/trustlens";
import {
  GROQ_CHAT_URL,
  GROQ_TEXT_MODEL,
  GROQ_WHISPER_MODEL,
  stripJsonFences,
} from "../lib/groq";

const VERDICTS = ["safe", "suspicious", "flagged"] as const;

/** Ask Groq to weigh the acoustic features + conversation content and return
 *  a plain-language verdict. Returns a friendly `{ ok: false }` instead of
 *  throwing when the API key is missing so the UI can guide setup. */
export const groqVerdict = action({
  args: {
    voiceMetrics: v.optional(
      v.object({
        pitchHz: v.optional(v.number()),
        jitterPct: v.optional(v.number()),
        flatness: v.optional(v.number()),
        rolloff: v.optional(v.number()),
        confidence: v.optional(v.number()),
      }),
    ),
    transcript: v.optional(
      v.array(
        v.object({
          speaker: v.string(),
          text: v.string(),
        }),
      ),
    ),
    flags: v.optional(
      v.array(
        v.object({
          id: v.string(),
          label: v.string(),
          severity: v.string(),
        }),
      ),
    ),
    channel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        message:
          "Groq is not configured yet — add GROQ_API_KEY in the project Keys UI, then try again.",
      };
    }

    const transcriptLines: TranscriptLine[] = (args.transcript ?? []).map((l) => ({
      speaker: l.speaker === "you" ? "you" : "caller",
      text: l.text,
      t: 0,
    }));
    const normalizedFlags: ScamFlag[] = (args.flags ?? []).map((f) => ({
      id: f.id,
      label: f.label,
      kind: "behavior",
      severity:
        f.severity === "critical" || f.severity === "warning" || f.severity === "info"
          ? (f.severity as Severity)
          : "warning",
    }));
    const transcriptText = transcriptLines
      .map((l) => `${l.speaker === "you" ? "Recipient" : "Caller"}: ${l.text}`)
      .join("\n");
    const flagText = normalizedFlags
      .map((f) => `- [${f.severity}] ${f.label}`)
      .join("\n");
    const metrics = args.voiceMetrics;

    const systemPrompt = `You are Trust Lens, a deepfake-voice and scam-call analyst for an internal fraud-detection team.

Your job: decide whether a voice interaction shows signs of AI voice cloning (synthetic speech) and/or social-engineering scam patterns, and give a clear verdict.

Reference ranges for the acoustic features (measured on the caller's audio):
- Pitch jitter (%): human speech is naturally jittery, roughly 3–8%. Most TTS / voice-clone output is unnaturally steady, often under 1.5%.
- Prosody flatness (0–1): higher means flatter, emotionless intonation — a known clone/TTS signature.
- Spectral rolloff (0–1): higher means duller, band-limited audio — consistent with vocoder artifacts.
- Synthetic-voice confidence (0–100): the edge engine's on-device estimate of how likely the voice is AI-generated.

Also weigh any listed scam markers (urgency, money/UPI demands, secrecy pressure, claimed-but-unverified relations) and the transcript itself.

Respond with STRICT JSON only, no markdown, in exactly this shape:
{"verdict":"safe" | "suspicious" | "flagged","confidence":<0-100 integer>,"summary":"<2-3 sentence plain-language explanation>","markers":["<one short finding per item>"]}

Rules:
- "flagged" when the voice shows clear synthetic traits or an active scam pattern (urgent money demand + secrecy pressure).
- "suspicious" when there are soft signs worth a second look: an unknown caller claiming a close relation, an emergency story, urgency, or sensitive/payment requests.
- "safe" when nothing stands out.
- Normal greetings and small talk such as "hello, how are you" are safe, even from an unknown/private number, unless paired with impersonation, urgency, secrecy, money/UPI/OTP requests, or very strong synthetic-voice evidence.
- Do not infer a scam from a short benign transcript, missing caller identity, silence, or unknown channel alone.
- Be calibrated, never alarmist. Trust Lens is a warning aid, not evidence.`;

    const userPrompt = [
      `Channel: ${args.channel ?? "unknown"}`,
      metrics
        ? `Voice metrics (caller audio):\n${JSON.stringify(
            {
              pitchHz: metrics.pitchHz ?? null,
              jitterPct: metrics.jitterPct ?? null,
              flatness: metrics.flatness ?? null,
              rolloff: metrics.rolloff ?? null,
              syntheticConfidence: metrics.confidence ?? null,
            },
            null,
            2,
          )}`
        : "Voice metrics: none provided.",
      flagText ? `Detected markers:\n${flagText}` : "Detected markers: none.",
      transcriptText ? `Transcript:\n${transcriptText}` : "Transcript: none provided.",
    ].join("\n\n");

    let content: string;
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
      content = data?.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      const detail =
        err instanceof Error ? err.message : "Unknown Groq error";
      return { ok: false, message: `Groq request failed: ${detail}` };
    }

    try {
      const parsed = JSON.parse(stripJsonFences(content)) as {
        verdict?: string;
        confidence?: number;
        summary?: string;
        markers?: string[];
      };
      const rawVerdict = VERDICTS.includes(parsed.verdict as (typeof VERDICTS)[number])
        ? (parsed.verdict as Verdict)
        : "suspicious";
      const verdict = calibrateVerdict(
        rawVerdict,
        normalizedFlags,
        transcriptLines,
        metrics
          ? {
              confidence: metrics.confidence,
              jitterPct: metrics.jitterPct,
              flatness: metrics.flatness,
              rolloff: metrics.rolloff,
            }
          : undefined,
      );
      const rawConfidence = Math.max(
        0,
        Math.min(100, Math.round(Number(parsed.confidence) || 0)),
      );
      const confidence =
        verdict === "safe" && rawVerdict !== "safe"
          ? Math.min(rawConfidence, isLowRiskSmallTalk(transcriptLines) ? 24 : 39)
          : rawConfidence;
      const calibratedSummary =
        verdict === "safe" && rawVerdict !== "safe"
          ? "The transcript is ordinary small talk with no scam markers. An unknown channel alone is not enough to flag the call."
          : "";
      const summary = calibratedSummary || String(parsed.summary ?? "").trim();
      const markers = calibratedSummary
        ? []
        : Array.isArray(parsed.markers)
        ? parsed.markers.map(String).slice(0, 8)
        : [];

      // Fire-and-forget circle alert on a flagged call. Wrapped so a
      // Resend hiccup never breaks the verdict the user already sees.
      if (verdict === "flagged") {
        try {
          const userName = await ctx.runQuery(internal.circle.getUserName, {
            userId,
          });
          await ctx.scheduler.runAfter(0, internal.alerts.notifyCircleOnFlag, {
            userId,
            userName: userName ?? undefined,
            verdict,
            confidence,
            summary,
            markers,
          });
        } catch (err) {
          console.warn(
            "[analyze] failed to schedule circle alert:",
            err instanceof Error ? err.message : err,
          );
        }
      }

      return { ok: true, verdict, confidence, summary, markers };
    } catch {
      return {
        ok: false,
        message: "Groq returned an unreadable response — please retry.",
      };
    }
  },
});

const WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
/** Transcribe a short base64-encoded audio chunk (webm/mp4/wav) with Groq
 *  Whisper. The live voice check streams 3–4 s chunks through this as the
 *  conversation happens, so the scam-pattern agent can read the words too. */
export const groqTranscribe = action({
  args: {
    audioBase64: v.string(),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        message:
          "Groq is not configured yet — add GROQ_API_KEY in the project Keys UI, then try again.",
      };
    }
    if (args.audioBase64.length < 64) {
      return { ok: false, message: "Audio chunk too small to transcribe." };
    }
    try {
      const buf = Buffer.from(args.audioBase64, "base64");
      const form = new FormData();
      form.append("model", GROQ_WHISPER_MODEL);
      form.append(
        "file",
        new Blob([buf], { type: args.mimeType ?? "audio/webm" }),
        "chunk.webm",
      );
      form.append("response_format", "json");
      const { data } = await axios.post(WHISPER_URL, form, {
        headers: { Authorization: `Bearer ${apiKey}` },
        maxBodyLength: 35_000_000,
        maxContentLength: 35_000_000,
      });
      const text = String(data?.text ?? "").trim();
      return text ? { ok: true, text } : { ok: false, message: "No speech detected." };
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown Groq error";
      return { ok: false, message: `Transcription failed: ${detail}` };
    }
  },
});
