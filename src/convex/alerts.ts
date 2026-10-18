"use node";

import { v } from "convex/values";
import axios from "axios";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const notifyCircleOnFlag = internalAction({
  args: { alertId: v.id("circleAlerts") },
  handler: async (ctx, { alertId }) => {
    const delivery = await ctx.runQuery(internal.alertQueue.delivery, {
      alertId,
    });
    if (!delivery || delivery.emails.length === 0) {
      await ctx.runMutation(internal.alertQueue.complete, {
        alertId,
        status: "skipped",
      });
      return;
    }
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      console.warn(
        "Circle alerts require RESEND_API_KEY and RESEND_FROM_EMAIL.",
      );
      await ctx.runMutation(internal.alertQueue.complete, {
        alertId,
        status: "failed",
      });
      return;
    }
    // Only who, when and verdict leave the app; no transcript-derived summary.
    const results = await Promise.allSettled(
      delivery.emails.map((email, index) =>
        axios.post(
          "https://api.resend.com/emails",
          {
            from,
            to: email,
            subject: "Trust Lens: a call needs verification",
            text: `${delivery.who} had a call flagged at ${new Date(delivery.when).toISOString()}. Please contact them separately to check in. This is a warning aid, not proof of fraud.`,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Idempotency-Key": `${alertId}-${index}`,
            },
            timeout: 15_000,
          },
        ),
      ),
    );
    for (const result of results) {
      if (result.status !== "rejected") continue;
      const failure = result.reason as {
        response?: {
          status?: number;
          data?: { name?: string; message?: string };
        };
        message?: string;
      } | null;
      const detail =
        failure?.response?.data?.message ??
        failure?.message ??
        "Email submission failed";
      // Never log Axios config, authorization headers or recipient addresses.
      const message = String(detail)
        .replace(
          /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+/gi,
          "[redacted email]",
        )
        .replace(/\b(?:re_|gsk_)[A-Za-z0-9_-]+/g, "[redacted key]")
        .slice(0, 300);
      console.warn("[alerts] Email submission failed", {
        alertId,
        status: failure?.response?.status,
        message,
      });
    }
    const sent = results.some((result) => result.status === "fulfilled");
    await ctx.runMutation(internal.alertQueue.complete, {
      alertId,
      status: sent ? "sent" : "failed",
    });
  },
});
