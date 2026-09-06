import { v } from "convex/values";
import { Resend } from "resend";
import { internalAction } from "./_generated/server";

export const sendAlerts = internalAction({
  args: {
    callerName: v.string(),
    callerNumber: v.optional(v.string()),
    circleMembers: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        phone: v.string(),
        email: v.optional(v.string()),
        relation: v.string(),
      })
    ),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("RESEND_API_KEY not configured. Skipping email alerts.");
      return;
    }

    const resend = new Resend(apiKey);

    for (const member of args.circleMembers) {
      const recipientEmail = member.email;
      if (!recipientEmail) {
        console.warn(
          `Circle member "${member.name}" has no email — skipping.`
        );
        continue;
      }

      const callerInfo = args.callerName || "an unknown caller";
      const numberInfo = args.callerNumber ? ` (${args.callerNumber})` : "";

      try {
        await resend.emails.send({
          from: "TrustLens Alerts <onboarding@resend.dev>",
          to: recipientEmail,
          subject: "🚨 TrustLens: Scam Call Intercepted",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #dc2626; margin-bottom: 16px;">🚨 Scam Call Alert</h2>
              <p style="font-size: 16px; line-height: 1.6; color: #333;">
                Hi <strong>${member.name}</strong>,
              </p>
              <p style="font-size: 16px; line-height: 1.6; color: #333;">
                A scam call was just intercepted from <strong>${callerInfo}${numberInfo}</strong>.
              </p>
              <p style="font-size: 16px; line-height: 1.6; color: #333;">
                Please check on your circle member as soon as possible.
              </p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
              <p style="font-size: 12px; color: #9ca3af;">
                Sent by TrustLens — AI-powered scam call protection
              </p>
            </div>
          `,
        });
        console.log(
          `Successfully sent alert email to ${member.name} (${recipientEmail})`
        );
      } catch (error) {
        console.error(
          `Failed to send alert email to ${member.name} (${recipientEmail}):`,
          error
        );
      }
    }
  },
});
