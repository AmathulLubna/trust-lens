"use node";
import { v } from "convex/values";
import { Resend } from "resend";
import { createHash } from "node:crypto";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const deliver = internalAction({
  args: { userId: v.id("users"), eventId: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.runMutation(internal.alertPolicy.claim, args);
    if (!event) return;
    const key = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM;
    if (!key || !from || from.includes("resend.dev")) {
      await ctx.runMutation(internal.alertPolicy.update, {
        ...args,
        status: "failed",
        providerIds: [],
        detail: "Configure a verified RESEND_FROM and RESEND_API_KEY",
      });
      return;
    }
    const ids: string[] = [];
    let unknown = false;
    for (const email of event.recipients) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + key,
            "Content-Type": "application/json",
            "Idempotency-Key": createHash("sha256")
              .update(args.userId + ":" + args.eventId + ":" + email)
              .digest("hex"),
          },
          body: JSON.stringify({
            from,
            to: email,
            subject: "TrustLens: independently verify a sensitive request",
            text: "Someone who added you to their alert circle received a screening warning. Please contact them through your previously saved contact. This warning does not prove fraud or caller identity. No recording or transcript is included.",
          }),
          signal: AbortSignal.timeout(10000),
        });
        const body = (await response.json()) as {
          id?: string;
          error?: unknown;
        };
        if (response.ok && body.id && !body.error) ids.push(body.id);
        else if (response.ok || response.status >= 500) unknown = true;
      } catch {
        unknown = true; /* A timed-out request may have been accepted. */
      }
    }
    await ctx.runMutation(internal.alertPolicy.update, {
      ...args,
      status:
        ids.length === event.recipients.length
          ? "accepted_by_provider"
          : ids.length
            ? "partially_accepted"
            : unknown
              ? "delivery_unknown"
              : "failed",
      providerIds: ids,
      detail: unknown
        ? "Some delivery attempts have no confirmed provider response"
        : "Provider acceptance is not delivery confirmation",
    });
  },
});
export const verifyWebhook = internalAction({
  args: {
    payload: v.string(),
    id: v.string(),
    timestamp: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret || args.payload.length > 65536) return false;
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const event = resend.webhooks.verify({
        payload: args.payload,
        headers: {
          id: args.id,
          timestamp: args.timestamp,
          signature: args.signature,
        },
        webhookSecret: secret,
      });
      if (
        !["email.delivered", "email.failed", "email.bounced"].includes(
          event.type,
        )
      )
        return true;
      const data = event.data as { email_id?: string };
      if (!data.email_id) return false;
      return await ctx.runMutation(internal.alertPolicy.webhookUpdate, {
        providerId: data.email_id,
        type: event.type,
      });
    } catch {
      return false;
    }
  },
});
