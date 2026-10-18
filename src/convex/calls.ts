import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { queueCircleAlert } from "./alertQueue";

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
    sessionId: v.string(),
    archiveTranscript: v.optional(v.boolean()),
    callerName: v.optional(v.string()),
    callerNumber: v.optional(v.string()),
    channel: v.union(
      v.literal("phone"),
      v.literal("unknown"),
    ),
    startedAt: v.number(),
    durationSec: v.number(),
    verdict: v.union(
      v.literal("safe"),
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
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    if (!args.sessionId || args.sessionId.length > 128) throw new Error("Invalid session ID");
    const existing = await ctx.db.query("callLogs")
      .withIndex("by_user_session", q => q.eq("userId", userId).eq("sessionId", args.sessionId)).first();
    if (existing) return existing._id;
    const alert = await ctx.db.query("circleAlerts")
      .withIndex("by_user_session", q => q.eq("userId", userId).eq("sessionId", args.sessionId)).first();
    const id = await ctx.db.insert("callLogs", {
      userId,
      sessionId: args.sessionId,
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
      transcript: args.archiveTranscript === true ? args.transcript : undefined,
      notifiedCircle: alert?.status === "sent",
    });

    if (args.verdict === "flagged") await queueCircleAlert(ctx, userId, args.sessionId);

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
    const logs = await ctx.db
      .query("callLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    await Promise.all(logs.map((log) => ctx.db.delete(log._id)));
    const alerts = await ctx.db.query("circleAlerts")
      .withIndex("by_user_session", q => q.eq("userId", userId)).collect();
    await Promise.all(alerts.map(alert => ctx.db.delete(alert._id)));
  },
});
