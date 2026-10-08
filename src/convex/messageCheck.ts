import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { scamFlagsFromText } from "../lib/trustlens";
import { api } from "./_generated/api";
export const check = action({
  args: {
    sender: v.optional(v.string()),
    text: v.string(),
    retainText: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | {
        ok: true;
        verdict: "suspicious" | "no_strong_indicators" | "inconclusive";
        reasons: string[];
        summary: string;
      }
    | { ok: false; message: string }
  > => {
    if (!(await getAuthUserId(ctx))) throw new Error("Not authenticated");
    if (!args.text.trim() || args.text.length > 5000)
      return { ok: false, message: "Enter a message up to 5000 characters" };
    const flags = scamFlagsFromText(args.text);
    const reasons = flags.map((f) => f.label);
    const verdict = flags.length ? "suspicious" : "no_strong_indicators";
    await ctx.runMutation(api.messages.recordCheck, {
      sender: args.sender?.slice(0, 100),
      messagePreview: args.retainText === true ? args.text.slice(0, 180) : "",
      verdict,
      reasons,
      createdAt: Date.now(),
    });
    return {
      ok: true,
      verdict,
      reasons,
      summary:
        "Local request-rule screening only. No authenticity or sender identity verification is performed. Independent verification remains necessary for sensitive requests.",
    };
  },
});
