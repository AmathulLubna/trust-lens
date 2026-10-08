import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

/** Ledger of screened calls for the signed-in user, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const logs = await ctx.db
      .query("callLogs")
      .withIndex("by_user_time", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
    return logs;
  },
});

export const record = mutation({
  args: {
    callerName: v.optional(v.string()),
    callerNumber: v.optional(v.string()),
    channel: v.union(
      v.literal("phone"),
      v.literal("whatsapp"),
      v.literal("unknown"),
    ),
    startedAt: v.number(),
    durationSec: v.number(),
    verdict: v.union(
      v.literal("safe"),
      v.literal("no_strong_indicators"),
      v.literal("inconclusive"),
      v.literal("analysis_unavailable"),
      v.literal("insufficient_audio"),
      v.literal("suspicious"),
      v.literal("flagged"),
    ),
    riskScore: v.number(),
    voiceScore: v.optional(v.number()),
    behaviorScore: v.optional(v.number()),
    flags: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        kind: v.union(
          v.literal("voice"),
          v.literal("behavior"),
          v.literal("contact"),
        ),
        severity: v.union(
          v.literal("info"),
          v.literal("warning"),
          v.literal("critical"),
        ),
      }),
    ),
    transcript: v.optional(
      v.array(
        v.object({
          speaker: v.union(v.literal("caller"), v.literal("you")),
          text: v.string(),
          t: v.number(),
        }),
      ),
    ),
    notifiedCircle: v.optional(v.boolean()),
    transcriptConsent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    const id = await ctx.db.insert("callLogs", {
      userId,
      callerName: args.callerName,
      callerNumber: args.callerNumber,
      channel: args.channel,
      startedAt: args.startedAt,
      durationSec: args.durationSec,
      verdict: args.verdict,
      riskScore: args.riskScore,
      voiceScore: args.voiceScore,
      behaviorScore: args.behaviorScore,
      flags: args.flags,
      transcript: args.transcriptConsent === true ? args.transcript : undefined,
      transcriptConsent: args.transcriptConsent === true,
      notifiedCircle: false,
      source: "demo",
      notificationStatus: "demo_excluded",
    });

    return id;
  },
});

/** Wipe the ledger (privacy requirement: deletion is one tap away). */
export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    const preferences = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (preferences)
      await ctx.db.patch(preferences._id, { historyClearedAt: Date.now() });
    else
      await ctx.db.insert("userSettings", {
        userId,
        bannerAlert: true,
        vibrationAlert: true,
        fullscreenAlert: false,
        autoNotifyCircle: false,
        sensitivity: 2,
        channelPhone: false,
        channelWhatsapp: false,
        historyClearedAt: Date.now(),
      });
    const logs = await ctx.db
      .query("callLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const log of logs) await ctx.db.delete(log._id);
    const uploads = await ctx.db
      .query("audioUploads")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const upload of uploads) {
      await ctx.storage.delete(upload.storageId);
      await ctx.db.delete(upload._id);
    }
    for (const table of [
      "analysisRuns",
      "alertEvents",
      "messageChecks",
      "numberChecks",
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .filter((q) => q.eq(q.field("userId"), userId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
  },
});
