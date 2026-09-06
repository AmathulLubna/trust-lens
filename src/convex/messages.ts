import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const recordCheck = mutation({
  args: {
    sender: v.optional(v.string()),
    messagePreview: v.string(),
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
    if (userId === null) throw new Error("Not authenticated");
    await ctx.db.insert("messageChecks", { userId, ...args });
  },
});

export const history = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return ctx.db
      .query("messageChecks")
      .withIndex("by_user_time", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});
