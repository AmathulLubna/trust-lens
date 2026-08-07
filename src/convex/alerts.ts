"use node";

import { v } from "convex/values";
import axios from "axios";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const RESEND_URL = "https://api.resend.com/emails";
// Resend's sandbox "from" address — works without a verified custom domain.
// Swap to something like "Trust Lens <alerts@yourdomain.com>" once you've
// verified a domain in the Resend dashboard.
const FROM_ADDRESS = "Trust Lens <onboarding@resend.dev>";

/** Fire an email alert to every trusted-circle member who has
 *  notifyOnFlag=true and an email on file, when a call comes back
 *  "flagged" (or "suspicious", if you want it more sensitive later).
 *  Called from analyze.ts's groqVerdict action — never throws, so a
 *  failed alert never breaks the verdict the user is already seeing. */
export const notifyCircleOnFlag = internalAction({
  args: {
    userId: v.id("users"),
    userName: v.optional(v.string()),
    verdict: v.string(),
    confidence: v.number(),
    summary: v.string(),
    markers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn(
        "[alerts] RESEND_API_KEY not set — skipping circle notification.",
      );
      return { ok: false, sent: 0, reason: "no_api_key" as const };
    }

    const members = await ctx.runQuery(internal.circle.listForAlerts, {
      userId: args.userId,
    });
    const recipients = members.filter(
      (m): m is typeof m & { email: string } =>
        typeof m.email === "string" && m.email.length > 0,
    );
    if (recipients.length === 0) {
      return { ok: true, sent: 0, reason: "no_recipients" as const };
    }

    const who = args.userName?.trim() || "Someone in your circle";
    const subject = `⚠ Trust Lens flagged a call for ${who}`;
    const markersHtml = args.markers.length
      ? `<ul>${args.markers.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`
      : "<p>No specific markers listed.</p>";

    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#dc2626;">Trust Lens Alert</h2>
        <p><strong>${escapeHtml(who)}</strong> just had a call flagged as
        <strong>${escapeHtml(args.verdict)}</strong>
        (${Math.round(args.confidence)}% confidence).</p>
        <p>${escapeHtml(args.summary)}</p>
        <p><strong>What Trust Lens noticed:</strong></p>
        ${markersHtml}
        <p style="color:#6b7280; font-size: 12px; margin-top: 24px;">
          You're getting this because ${escapeHtml(who)} added you to their
          Trust Lens alert circle. This is an automated warning aid, not
          proof of fraud — reach out to them directly to check in.
        </p>
      </div>
    `.trim();

    let sent = 0;
    const failures: string[] = [];

    // Resend's free tier is fine with sequential sends for a small circle;
    // Promise.allSettled keeps one bad email from blocking the rest.
    const results = await Promise.allSettled(
      recipients.map((r) =>
        axios.post(
          RESEND_URL,
          {
            from: FROM_ADDRESS,
            to: r.email,
            subject,
            html,
          },
          { headers: { Authorization: `Bearer ${apiKey}` } },
        ),
      ),
    );

    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        sent += 1;
      } else {
        // axios errors carry the real API response in .response.data —
        // .message alone just says "Request failed with status code 403"
        // which tells you nothing. Pull the actual Resend error body.
        let detail: string;
        const reason = r.reason as {
          response?: { status?: number; data?: unknown };
          message?: string;
        };
        if (reason?.response) {
          detail = `HTTP ${reason.response.status}: ${JSON.stringify(reason.response.data)}`;
        } else {
          detail = reason?.message ?? String(r.reason);
        }
        failures.push(`${recipients[i].email}: ${detail}`);
      }
    });

    if (failures.length) {
      console.error("[alerts] circle email send failures:", failures.join(" | "));
    }
    if (sent > 0) {
      console.log(`[alerts] sent ${sent} circle alert email(s).`);
    }

    return { ok: true, sent, failed: failures.length, failureDetails: failures };
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
