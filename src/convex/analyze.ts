"use node";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { scamFlagsFromText } from "../lib/trustlens";

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
      v.array(v.object({ speaker: v.string(), text: v.string() })),
    ),
    flags: v.optional(
      v.array(
        v.object({ id: v.string(), label: v.string(), severity: v.string() }),
      ),
    ),
    channel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await getAuthUserId(ctx))) throw new Error("Not authenticated");
    const text = (args.transcript ?? [])
      .map((l) => l.text)
      .join(" ")
      .slice(0, 24000);
    const flags = scamFlagsFromText(text);
    return {
      ok: true,
      verdict: flags.length
        ? ("suspicious" as const)
        : ("inconclusive" as const),
      summary:
        "Context-only screening. Acoustic analysis is unavailable through this legacy endpoint; verify sensitive requests independently.",
      markers: flags.map((f) => f.label),
    };
  },
});
export const groqTranscribe = action({
  args: {
    audioBase64: v.string(),
    mimeType: v.optional(v.string()),
    filename: v.optional(v.string()),
    language: v.optional(v.string()),
  },
  handler: async (ctx) => {
    if (!(await getAuthUserId(ctx))) throw new Error("Not authenticated");
    return {
      ok: false,
      message:
        "Use /audio/upload and acoustic.analyze with a storage identifier. Base64 audio actions are no longer supported.",
    };
  },
});
