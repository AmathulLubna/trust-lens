import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const DEFAULTS = {
  vibrationAlert: true,
  bannerAlert: true,
  fullscreenAlert: false,
  autoNotifyCircle: true,
  sensitivity: 2 as 1 | 2 | 3,
  channelPhone: true,
  channelWhatsapp: true,
};

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return settings ? { ...DEFAULTS, ...settings } : DEFAULTS;
  },
});

export const update = mutation({
  args: {
    vibrationAlert: v.optional(v.boolean()),
    bannerAlert: v.optional(v.boolean()),
    fullscreenAlert: v.optional(v.boolean()),
    autoNotifyCircle: v.optional(v.boolean()),
    sensitivity: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
    channelPhone: v.optional(v.boolean()),
    channelWhatsapp: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const patch = { ...args, userId };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("userSettings", { ...DEFAULTS, ...patch });
    }
  },
});
