import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  normalizeNumber,
  prettyNumber,
  REPORT_CATEGORIES,
  isValidNumber,
} from "../lib/numbers";

/** Community reports for one normalized number (used by the lookup action). */
export const reportsForNumber = query({
  args: { number: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const rows = await ctx.db
      .query("numberReports")
      .withIndex("by_number", (q) => q.eq("number", args.number))
      .take(100);
    const counts: Record<string, number> = {};
    for (const row of rows)
      counts[row.category] = (counts[row.category] ?? 0) + 1;
    return {
      counts,
      truncated: rows.length === 100,
      ownReport: rows
        .filter((r) => r.userId === userId)
        .map((r) => ({
          category: r.category,
          note: r.note,
          createdAt: r.createdAt,
        })),
    };
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
    if (
      !isValidNumber(args.number) ||
      !REPORT_CATEGORIES.some((c) => c.value === args.category)
    )
      throw new Error("Invalid report");
    if ((args.note?.length ?? 0) > 1000)
      throw new Error("Keep private notes under 1000 characters");
    const own = await ctx.db
      .query("numberReports")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (own.filter((r) => r.createdAt > Date.now() - 60000).length >= 5)
      throw new Error("Report rate limit reached");
    const normalized = normalizeNumber(args.number);
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
    riskScore: v.optional(v.number()),
    verdict: v.union(
      v.literal("safe"),
      v.literal("no_strong_indicators"),
      v.literal("inconclusive"),
      v.literal("analysis_unavailable"),
      v.literal("insufficient_audio"),
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
