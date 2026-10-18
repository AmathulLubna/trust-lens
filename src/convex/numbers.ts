import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { normalizeNumber, prettyNumber, REPORT_CATEGORIES, isValidNumber } from "../lib/numbers";

/** Community reports for one normalized number (used by the lookup action). */
export const reportsForNumber = query({
  args: { number: v.string() },
  handler: async (ctx, args) => {
    if (await getAuthUserId(ctx) === null) throw new Error("Not authenticated");
    const reports = await ctx.db
      .query("numberReports")
      .withIndex("by_number", (q) => q.eq("number", normalizeNumber(args.number)))
      .take(50);
    // Deduplicate internally without publishing stable reporter identifiers.
    const unique = new Map(reports.map(report => [report.userId, report]));
    return [...unique.values()].map(({ category, note, createdAt }) => ({ category, note, createdAt }));
  },
});

/** A teammate flags (or clears) a number. One report per user per number —
 *  reporting again updates the existing entry. */
export const reportNumber = mutation({
  args: {
    number: v.string(),
    display: v.string(),
    category: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    const normalized = normalizeNumber(args.number);
    if (!isValidNumber(args.number)) throw new Error("Invalid phone number");
    if (!REPORT_CATEGORIES.some(c => c.value === args.category)) throw new Error("Invalid report category");
    if ((args.note?.length ?? 0) > 1000) throw new Error("Keep report notes under 1,000 characters");
    const existing = await ctx.db
      .query("numberReports")
      .withIndex("by_number", (q) => q.eq("number", normalized))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();
    const patch = {
      number: normalized,
      display: prettyNumber(args.display),
      category: args.category,
      note: args.note?.trim() || undefined,
      createdAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("numberReports", { userId, ...patch });
    }
  },
});

/** Records a screening-desk lookup in the user's check ledger. */
export const recordCheck = mutation({
  args: {
    number: v.string(),
    display: v.string(),
    riskScore: v.number(),
    verdict: v.union(
      v.literal("safe"),
      v.literal("suspicious"),
      v.literal("flagged"),
    ),
    reasons: v.array(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    await ctx.db.insert("numberChecks", { userId, ...args });
  },
});

/** This user's recent number checks, newest first. */
export const history = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return ctx.db
      .query("numberChecks")
      .withIndex("by_user_time", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});
