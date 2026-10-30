import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { queueCircleAlert } from "./alertQueue";
import { localVoiceInput } from "./voiceResult";

/** Explicitly save an experimental local result. Saving alone never sends alerts. */
export const recordLocalVoice = mutation({
  args: { sessionId: v.string(), result: localVoiceInput, alertCircle: v.boolean() },
  handler: async (ctx, { sessionId, result, alertCircle }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    if (!sessionId || sessionId.length > 128) throw new Error("Invalid session ID");
    if (!Number.isFinite(result.score) || result.score < 0 || result.score > 1 ||
        !Number.isFinite(result.threshold) || result.threshold < 0 || result.threshold > 1 ||
        !Number.isFinite(result.seconds) || result.seconds < 1 || result.seconds > 120 ||
        !Number.isInteger(result.windows) || result.windows < 1 || result.windows > 120 ||
        (result.checkTimeSec !== undefined && (!Number.isFinite(result.checkTimeSec) || result.checkTimeSec < 0))) {
      throw new Error("Invalid local voice result");
    }
    const vote = result.score >= result.threshold ? "AI-like" as const : "human-like" as const;
    if (alertCircle && vote !== "AI-like") throw new Error("Circle alerts are available only for AI-like model votes.");
    const existing = await ctx.db.query("callLogs")
      .withIndex("by_user_session", q => q.eq("userId", userId).eq("sessionId", sessionId)).first();
    if (existing && (!existing.localVoice || Object.entries(result).some(([key, value]) =>
      existing.localVoice?.[key as keyof typeof result] !== value))) {
      throw new Error("This session already contains a different result. Analyze the recording again.");
    }
    const id = existing?._id ?? await ctx.db.insert("callLogs", {
      userId, sessionId, callerName: `VoiceSentinel ${result.model} · ${vote}`,
      channel: "unknown", startedAt: Date.now(), durationSec: result.seconds,
      // Legacy ledger categories require a review bucket. The UI displays the
      // preserved inconclusive assessment, never a verified-safe/scam verdict.
      verdict: "suspicious", riskScore: 50,
      flags: [{ id: "local-voice-result", kind: "voice", severity: "info",
        label: `${result.model} experimental vote: ${vote}. Assessment: Inconclusive.` }],
      localVoice: { ...result, vote, assessment: "Inconclusive" },
      circleAlertRequested: alertCircle, notifiedCircle: false,
    });
    if (alertCircle) {
      if (existing) await ctx.db.patch(id, { circleAlertRequested: true });
      // Keep the save successful while email setup is deferred.
      if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
        await queueCircleAlert(ctx, userId, sessionId, { manual: true });
      }
    }
    return id;
  },
});

export const localVoiceArchiveStatus = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const log = await ctx.db.query("callLogs")
      .withIndex("by_user_session", q => q.eq("userId", userId).eq("sessionId", sessionId)).first();
    const alert = log?.circleAlertRequested ? await ctx.db.query("circleAlerts")
      .withIndex("by_user_session", q => q.eq("userId", userId).eq("sessionId", sessionId)).first() : null;
    const alertStatus = !log?.circleAlertRequested ? "not_requested" as const
      : alert ? alert.status
      : !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL ? "not_configured" as const
      : "no_contacts" as const;
    return { saved: Boolean(log?.localVoice), alertStatus };
  },
});

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
      v.literal("whatsapp"),
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
