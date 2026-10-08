import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { isValidNumber, normalizeNumber, prettyNumber } from "../lib/numbers";
export const lookup = action({
  args: { number: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<
    | {
        ok: true;
        display: string;
        number: string;
        verdict: "inconclusive";
        counts: Record<string, number>;
        truncated: boolean;
      }
    | { ok: false; message: string }
  > => {
    if (!(await getAuthUserId(ctx))) throw new Error("Not authenticated");
    if (!isValidNumber(args.number))
      return { ok: false, message: "Enter a valid phone number" };
    const number = normalizeNumber(args.number);
    const display = prettyNumber(number);
    const reports = await ctx.runQuery(api.numbers.reportsForNumber, {
      number,
    });
    await ctx.runMutation(api.numbers.recordCheck, {
      number,
      display,
      verdict: "inconclusive",
      reasons: [
        "No verified reputation source is configured. Community reports are unmoderated observations; caller ID can be spoofed.",
      ],
      createdAt: Date.now(),
    });
    return {
      ok: true,
      number,
      display,
      verdict: "inconclusive",
      counts: reports.counts,
      truncated: reports.truncated,
    };
  },
});
