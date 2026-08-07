import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
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
      transcript: args.transcript,
      notifiedCircle: args.notifiedCircle,
    });

    if (args.notifiedCircle) {
      const trustedCircle = await ctx.db
        .query("trustedCircle")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.eq(q.field("notifyOnFlag"), true))
        .collect();
      
      const circleMembers = trustedCircle.map((member) => ({
        id: member._id,
        name: member.name,
        phone: member.phone,
        email: member.email,
        relation: member.relation,
      }));

      if (circleMembers.length > 0) {
        await ctx.scheduler.runAfter(0, internal.resend.sendAlerts, {
          callerName: args.callerName || "an unknown caller",
          callerNumber: args.callerNumber,
          circleMembers,
        });
      }
    }

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
  },
});
