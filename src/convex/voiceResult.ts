import { v } from "convex/values";

export const localVoiceFields = {
  model: v.union(v.literal("v4"), v.literal("v5")),
  score: v.number(),
  threshold: v.number(),
  seconds: v.number(),
  windows: v.number(),
  checkTimeSec: v.optional(v.number()),
};

export const localVoiceInput = v.object(localVoiceFields);
export const localVoiceRecord = v.object({
  ...localVoiceFields,
  vote: v.union(v.literal("AI-like"), v.literal("human-like")),
  assessment: v.literal("Inconclusive"),
});
