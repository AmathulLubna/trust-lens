import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";

const memberFields = {
  name: v.string(),
  phone: v.string(),
  email: v.optional(v.string()),
  relation: v.string(),
  notifyOnFlag: v.boolean(),
};

function memberDetails(input: Pick<Doc<"trustedCircle">, "name" | "phone" | "email" | "relation" | "notifyOnFlag">) {
  const details = {
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || undefined,
    relation: input.relation.trim(),
    notifyOnFlag: input.notifyOnFlag,
  };
  if (!details.name || !details.phone || !details.relation) {
    throw new ConvexError("Name, phone and relation are required.");
  }
  if (details.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) {
    throw new ConvexError("Enter a valid email address for alerts.");
  }
  return details;
}

/** The user's trusted circle (family safety net). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return ctx.db
      .query("trustedCircle")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const add = mutation({
  args: memberFields,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    const id = await ctx.db.insert("trustedCircle", {
      userId,
      ...memberDetails(args),
      addedAt: Date.now(),
    });
    return id;
  },
});

/** Edit the existing record; changing details never sends a circle alert. */
export const update = mutation({
  args: { memberId: v.id("trustedCircle"), ...memberFields },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const member = await ctx.db.get(args.memberId);
    if (!member || member.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(member._id, memberDetails(args));
    return member._id;
  },
});

export const remove = mutation({
  args: { memberId: v.id("trustedCircle") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    const member = await ctx.db.get(args.memberId);
    if (!member || member.userId !== userId) {
      throw new Error("Not found");
    }
    await ctx.db.delete(args.memberId);
  },
});

export const setNotify = mutation({
  args: { memberId: v.id("trustedCircle"), notifyOnFlag: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    const member = await ctx.db.get(args.memberId);
    if (!member || member.userId !== userId) {
      throw new Error("Not found");
    }
    await ctx.db.patch(args.memberId, { notifyOnFlag: args.notifyOnFlag });
  },
});

/** Internal-only: used by the alerts action to fetch which circle members
 *  should be notified for a given user, without exposing this to the
 *  public API surface (no auth check needed — caller already resolved
 *  and trusts userId from the action that invoked it). */
export const listForAlerts = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("trustedCircle")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return members.filter((m) => m.notifyOnFlag);
  },
});

/** Internal-only: look up a user's display name for alert emails. */
export const getUserName = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user?.name ?? user?.email ?? null;
  },
});
