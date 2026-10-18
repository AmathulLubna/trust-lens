import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** One atomic reservation per user/session, shared by live analysis and archiving. */
export async function queueCircleAlert(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: string,
) {
  if (!sessionId || sessionId.length > 128)
    throw new Error("Invalid session ID");
  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (settings?.autoNotifyCircle === false) return;
  const existing = await ctx.db
    .query("circleAlerts")
    .withIndex("by_user_session", (q) =>
      q.eq("userId", userId).eq("sessionId", sessionId),
    )
    .first();
  if (existing) return;
  const members = await ctx.db
    .query("trustedCircle")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  if (!members.some((m) => m.notifyOnFlag && m.email?.trim())) return;
  const alertId = await ctx.db.insert("circleAlerts", {
    userId,
    sessionId,
    createdAt: Date.now(),
    status: "queued",
  });
  await ctx.scheduler.runAfter(0, internal.alerts.notifyCircleOnFlag, {
    alertId,
  });
}

export const request = internalMutation({
  args: { userId: v.id("users"), sessionId: v.string() },
  handler: async (ctx, args) =>
    queueCircleAlert(ctx, args.userId, args.sessionId),
});

export const delivery = internalQuery({
  args: { alertId: v.id("circleAlerts") },
  handler: async (ctx, { alertId }) => {
    const alert = await ctx.db.get(alertId);
    if (!alert || alert.status !== "queued") return null;
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", alert.userId))
      .first();
    if (settings?.autoNotifyCircle === false) return null;
    const members = await ctx.db
      .query("trustedCircle")
      .withIndex("by_user", (q) => q.eq("userId", alert.userId))
      .collect();
    const user = await ctx.db.get(alert.userId);
    return {
      who: user?.name ?? user?.email ?? "Someone in your circle",
      when: alert.createdAt,
      emails: [
        ...new Set(
          members
            .filter((m) => m.notifyOnFlag && m.email?.trim())
            .map((m) => m.email!.trim()),
        ),
      ],
    };
  },
});

export const complete = internalMutation({
  args: {
    alertId: v.id("circleAlerts"),
    status: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
  },
  handler: async (ctx, { alertId, status }) => {
    const alert = await ctx.db.get(alertId);
    if (!alert || alert.status !== "queued") return;
    await ctx.db.patch(alertId, { status });
    const logs = await ctx.db
      .query("callLogs")
      .withIndex("by_user_session", (q) =>
        q.eq("userId", alert.userId).eq("sessionId", alert.sessionId),
      )
      .collect();
    for (const log of logs)
      await ctx.db.patch(log._id, { notifiedCircle: status === "sent" });
  },
});
