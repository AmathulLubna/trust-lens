import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { eligibleRecipients } from "../lib/alert-policy";
export const enqueue = internalMutation({
  args: { userId: v.id("users"), eventId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("alertEvents")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", args.userId).eq("eventId", args.eventId),
      )
      .first();
    if (existing) return;
    const log = await ctx.db
      .query("callLogs")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", args.userId).eq("eventId", args.eventId),
      )
      .first();
    if (!log || log.source === "demo" || log.verdict !== "suspicious") return;
    const prefs = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const members = await ctx.db
      .query("trustedCircle")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const recipients = eligibleRecipients(
      process.env.ALERT_DELIVERY_ENABLED === "true",
      prefs,
      members,
    );
    const recent = await ctx.db
      .query("alertEvents")
      .withIndex("by_user_event", (q) => q.eq("userId", args.userId))
      .collect();
    const limited =
      recent.filter(
        (e) =>
          e.createdAt > Date.now() - 600000 &&
          ["queued", "sending", "accepted_by_provider", "delivered"].includes(
            e.status,
          ),
      ).length >= 3;
    const status = limited
      ? "rate_limited"
      : recipients.length
        ? "queued"
        : "disabled_or_unverified";
    await ctx.db.insert("alertEvents", {
      ...args,
      status,
      recipients,
      createdAt: Date.now(),
    });
    await ctx.db.patch(log._id, {
      notificationStatus: status,
      notifiedCircle: false,
    });
    if (status === "queued")
      await ctx.scheduler.runAfter(0, internal.alerts.deliver, args);
  },
});
export const claim = internalMutation({
  args: { userId: v.id("users"), eventId: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("alertEvents")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", args.userId).eq("eventId", args.eventId),
      )
      .first();
    if (!event || event.status !== "queued") return null;
    const prefs = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const members = await ctx.db
      .query("trustedCircle")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const recipients = eligibleRecipients(
      process.env.ALERT_DELIVERY_ENABLED === "true",
      prefs,
      members,
    ).filter((r) => event.recipients.includes(r));
    const status = recipients.length ? "sending" : "disabled_or_unverified";
    await ctx.db.patch(event._id, { status, recipients });
    const log = await ctx.db
      .query("callLogs")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", args.userId).eq("eventId", args.eventId),
      )
      .first();
    if (log) await ctx.db.patch(log._id, { notificationStatus: status });
    if (recipients.length)
      await ctx.scheduler.runAfter(
        120000,
        internal.alertPolicy.expireSending,
        args,
      );
    return recipients.length ? { recipients, eventId: event.eventId } : null;
  },
});
export const update = internalMutation({
  args: {
    userId: v.id("users"),
    eventId: v.string(),
    status: v.string(),
    providerIds: v.array(v.string()),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("alertEvents")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", args.userId).eq("eventId", args.eventId),
      )
      .first();
    if (!event) return;
    await ctx.db.patch(event._id, {
      status: args.status,
      providerIds: args.providerIds,
      detail: args.detail,
    });
    const log = await ctx.db
      .query("callLogs")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", args.userId).eq("eventId", args.eventId),
      )
      .first();
    if (log)
      await ctx.db.patch(log._id, {
        notificationStatus: args.status,
        notifiedCircle: false,
      });
  },
});
export const webhookUpdate = internalMutation({
  args: { providerId: v.string(), type: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("alertEvents")
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "accepted_by_provider"),
          q.eq(q.field("status"), "partially_accepted"),
          q.eq(q.field("status"), "delivered"),
        ),
      )
      .collect();
    const event = events.find((e) => e.providerIds?.includes(args.providerId));
    if (!event) return false;
    if (args.type === "email.delivered") {
      const delivered = [
        ...new Set([...(event.deliveredIds ?? []), args.providerId]),
      ];
      const status =
        delivered.length === event.recipients.length
          ? "delivered"
          : event.status;
      await ctx.db.patch(event._id, { deliveredIds: delivered, status });
      const log = await ctx.db
        .query("callLogs")
        .withIndex("by_user_event", (q) =>
          q.eq("userId", event.userId).eq("eventId", event.eventId),
        )
        .first();
      if (log)
        await ctx.db.patch(log._id, {
          notificationStatus: status,
          notifiedCircle: status === "delivered",
        });
    } else if (["email.failed", "email.bounced"].includes(args.type)) {
      await ctx.db.patch(event._id, {
        status: "failed",
        detail: "Provider reported failed delivery",
      });
      const log = await ctx.db
        .query("callLogs")
        .withIndex("by_user_event", (q) =>
          q.eq("userId", event.userId).eq("eventId", event.eventId),
        )
        .first();
      if (log)
        await ctx.db.patch(log._id, {
          notificationStatus: "failed",
          notifiedCircle: false,
        });
    }
    return true;
  },
});

/** A lost action must not remain "sending" forever or imply successful delivery. */
export const expireSending = internalMutation({
  args: { userId: v.id("users"), eventId: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("alertEvents")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", args.userId).eq("eventId", args.eventId),
      )
      .first();
    if (!event || event.status !== "sending") return;
    await ctx.db.patch(event._id, {
      status: "delivery_unknown",
      detail:
        "Delivery attempt did not finish; no delivery confirmation is available",
    });
    const log = await ctx.db
      .query("callLogs")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", args.userId).eq("eventId", args.eventId),
      )
      .first();
    if (log)
      await ctx.db.patch(log._id, {
        notificationStatus: "delivery_unknown",
        notifiedCircle: false,
      });
  },
});
