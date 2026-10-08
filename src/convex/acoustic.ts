"use node";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  assess,
  MAX_AUDIO_BYTES,
  serviceResultSchema,
  unavailableAssessment,
  type Assessment,
} from "../lib/assessment";

export const analyze = action({
  args: {
    storageId: v.id("_storage"),
    eventId: v.string(),
    sequence: v.optional(v.number()),
    offsetSec: v.optional(v.number()),
    source: v.union(v.literal("upload"), v.literal("microphone")),
    retainTranscript: v.boolean(),
    language: v.union(v.literal("auto"), v.literal("hi"), v.literal("en")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    result: Assessment;
    cleanupPending: boolean;
    message?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (
      !/^[a-zA-Z0-9-]{8,80}$/.test(args.eventId) ||
      !Number.isInteger(args.sequence ?? 0) ||
      (args.sequence ?? 0) < 0 ||
      (args.sequence ?? 0) >= 300 ||
      (args.offsetSec ?? 0) < 0
    )
      throw new Error("Invalid session metadata");
    const upload = await ctx.runMutation(internal.audio.claim, {
      userId,
      storageId: args.storageId,
    });
    let result = unavailableAssessment();
    let message: string | undefined;
    let cleanupPending = false;
    try {
      const url = process.env.ACOUSTIC_SERVICE_URL;
      const token = process.env.ACOUSTIC_SERVICE_TOKEN;
      if (!url || !token) {
        message =
          "Acoustic service is not configured. Set ACOUSTIC_SERVICE_URL and ACOUSTIC_SERVICE_TOKEN on the server.";
      } else {
        const endpoint = new URL(url);
        if (
          endpoint.protocol !== "https:" &&
          !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
        )
          throw new Error("Acoustic service requires HTTPS");
        const blob = await ctx.storage.get(args.storageId);
        if (!blob || !blob.size || blob.size > MAX_AUDIO_BYTES)
          throw new Error("Invalid stored audio size");
        const form = new FormData();
        form.append("audio", blob, upload.filename);
        form.append("language", args.language);
        const response = await fetch(new URL("/analyze", endpoint), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-TrustLens-Owner": String(userId),
          },
          body: form,
          signal: AbortSignal.timeout(60000),
        });
        if (!response.ok)
          throw new Error(
            `Acoustic service rejected analysis (${response.status})`,
          );
        const payload = await response.json();
        if (payload?.service !== "trustlens-web-acoustic-v1")
          throw new Error("Configure the separate website acoustic service");
        result = assess(serviceResultSchema.parse(payload));
      }
    } catch {
      message =
        "Audio analysis failed or timed out. The result remains unavailable; verify sensitive requests independently.";
    } finally {
      try {
        await ctx.runMutation(internal.audio.expire, {
          storageId: args.storageId,
        });
      } catch {
        cleanupPending = true;
        message =
          "Temporary audio deletion is pending; the scheduled expiry will retry.";
      }
    }
    await ctx.runMutation(internal.audio.storeResult, {
      userId,
      eventId: args.eventId,
      sequence: args.sequence ?? 0,
      offsetSec: args.offsetSec ?? 0,
      source: args.source,
      retainTranscript: args.retainTranscript,
      analysisStartedAt: upload.createdAt,
      assessmentJson: JSON.stringify(result),
    });
    return { result, cleanupPending, ...(message ? { message } : {}) };
  },
});
