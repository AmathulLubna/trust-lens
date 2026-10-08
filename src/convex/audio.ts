import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  httpAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  MAX_AUDIO_BYTES,
  type Assessment,
  retainedAssessment,
  summarizeSession,
} from "../lib/assessment";
import { unavailableAssessment } from "../lib/assessment";

const cors = (request: Request) => {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = (process.env.WEB_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim());
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Filename",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
};
export const options = httpAction(
  async (_ctx, req) => new Response(null, { status: 204, headers: cors(req) }),
);
export const upload = httpAction(async (ctx, request) => {
  const headers = cors(request);
  let userId;
  try {
    userId = await getAuthUserId(ctx);
  } catch {
    userId = null;
  }
  if (!userId)
    return new Response("Not authenticated", { status: 401, headers });
  let name: string;
  try {
    name = decodeURIComponent(
      request.headers.get("X-Filename") ?? "recording.wav",
    )
      .replace(/[^\p{L}\p{M}\p{N}_. -]/gu, "_")
      .slice(0, 120);
  } catch {
    return new Response("Invalid filename", { status: 400, headers });
  }
  if (!/\.(wav|mp3|m4a|webm|ogg|aac|flac|opus)$/i.test(name))
    return new Response("Unsupported audio format", { status: 415, headers });
  if (Number(request.headers.get("Content-Length")) > MAX_AUDIO_BYTES)
    return new Response("Audio exceeds 18 MiB", { status: 413, headers });
  const reader = request.body?.getReader();
  if (!reader) return new Response("Missing audio", { status: 400, headers });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > MAX_AUDIO_BYTES) {
      await reader.cancel();
      return new Response("Audio exceeds 18 MiB", { status: 413, headers });
    }
    chunks.push(new Uint8Array(part.value));
  }
  if (!bytes) return new Response("Empty audio", { status: 400, headers });
  const storageId = await ctx.storage.store(
    new Blob(chunks, {
      type: request.headers.get("Content-Type") ?? "application/octet-stream",
    }),
  );
  try {
    await ctx.runMutation(internal.audio.register, {
      userId,
      storageId,
      filename: name,
    });
  } catch {
    await ctx.storage.delete(storageId);
    return new Response("Upload could not be registered", {
      status: 503,
      headers,
    });
  }
  return Response.json({ storageId }, { headers });
});
export const register = internalMutation({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
    filename: v.string(),
  },
  handler: async (ctx, args) => {
    const recent = await ctx.db
      .query("audioUploads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(20);
    if (recent.length >= 12) throw new Error("Too many pending uploads");
    await ctx.db.insert("audioUploads", {
      ...args,
      createdAt: Date.now(),
      state: "pending",
    });
    await ctx.scheduler.runAfter(15 * 60 * 1000, internal.audio.expire, {
      storageId: args.storageId,
    });
  },
});
export const expire = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await ctx.storage.delete(args.storageId);
    const row = await ctx.db
      .query("audioUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (row) await ctx.db.delete(row._id);
  },
});
export const remove = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const row = await ctx.db
      .query("audioUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!userId || !row || row.userId !== userId)
      throw new Error("Upload not found");
    await ctx.storage.delete(args.storageId);
    await ctx.db.delete(row._id);
  },
});
export const recordFailure = mutation({
  args: { eventId: v.string(), startedAt: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (
      !/^[a-zA-Z0-9-]{8,80}$/.test(args.eventId) ||
      !Number.isFinite(args.startedAt)
    )
      throw new Error("Invalid analysis metadata");
    const preferences = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (args.startedAt <= (preferences?.historyClearedAt ?? 0)) return;
    const existing = await ctx.db
      .query("callLogs")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", userId).eq("eventId", args.eventId),
      )
      .first();
    if (existing) return;
    const result = unavailableAssessment();
    await ctx.db.insert("callLogs", {
      userId,
      eventId: args.eventId,
      source: "upload",
      channel: "unknown",
      startedAt: args.startedAt,
      verdict: result.outcome,
      flags: [],
      assessmentJson: JSON.stringify(result),
      transcriptConsent: false,
      notificationStatus: "not_requested",
    });
  },
});
export const claim = internalMutation({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("audioUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!row || row.userId !== args.userId || row.state !== "pending")
      throw new Error("Upload unavailable or already analyzed");
    await ctx.db.patch(row._id, { state: "analyzing" });
    return { filename: row.filename, createdAt: row.createdAt };
  },
});
export const previous = internalQuery({
  args: { userId: v.id("users"), eventId: v.string(), sequence: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("analysisRuns")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", args.userId).eq("eventId", args.eventId),
      )
      .collect();
    return (
      rows.find((r) => r.sequence === args.sequence)?.assessmentJson ?? null
    );
  },
});
export const storeResult = internalMutation({
  args: {
    userId: v.id("users"),
    eventId: v.string(),
    sequence: v.number(),
    offsetSec: v.number(),
    assessmentJson: v.string(),
    retainTranscript: v.boolean(),
    analysisStartedAt: v.number(),
    source: v.union(v.literal("upload"), v.literal("microphone")),
  },
  handler: async (ctx, args) => {
    const preferences = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (args.analysisStartedAt <= (preferences?.historyClearedAt ?? 0)) return;
    const existing = await ctx.db
      .query("analysisRuns")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", args.userId).eq("eventId", args.eventId),
      )
      .collect();
    if (existing.some((r) => r.sequence === args.sequence)) return;
    const finished = await ctx.db
      .query("callLogs")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", args.userId).eq("eventId", args.eventId),
      )
      .first();
    if (finished) return;
    const result = retainedAssessment(
      JSON.parse(args.assessmentJson) as Assessment,
      args.retainTranscript,
    );
    if (args.source === "upload") {
      await ctx.db.insert("callLogs", {
        userId: args.userId,
        eventId: args.eventId,
        source: "upload",
        channel: "unknown",
        startedAt: Date.now(),
        durationSec: result.reliability.durationSec,
        verdict: result.outcome,
        flags: result.flags,
        assessmentJson: JSON.stringify(result),
        transcriptConsent: args.retainTranscript,
        notificationStatus: "not_requested",
      });
      await ctx.scheduler.runAfter(0, internal.alertPolicy.enqueue, {
        userId: args.userId,
        eventId: args.eventId,
      });
    } else {
      if (existing.length >= 300) throw new Error("Session limit reached");
      await ctx.db.insert("analysisRuns", {
        userId: args.userId,
        eventId: args.eventId,
        sequence: args.sequence,
        offsetSec: args.offsetSec,
        assessmentJson: JSON.stringify(result),
        createdAt: Date.now(),
      });
      await ctx.scheduler.runAfter(60 * 60 * 1000, internal.audio.expireRun, {
        userId: args.userId,
        eventId: args.eventId,
      });
    }
  },
});
export const expireRun = internalMutation({
  args: { userId: v.id("users"), eventId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("analysisRuns")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", args.userId).eq("eventId", args.eventId),
      )
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});
export const finishSession = mutation({
  args: {
    eventId: v.string(),
    expectedSegments: v.number(),
    startedAt: v.number(),
    durationSec: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const preferences = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (args.startedAt <= (preferences?.historyClearedAt ?? 0))
      throw new Error("Session was deleted; late finalization is excluded");
    if (
      !Number.isInteger(args.expectedSegments) ||
      args.expectedSegments < 0 ||
      args.expectedSegments > 300
    )
      throw new Error("Invalid segment count");
    const existing = await ctx.db
      .query("callLogs")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", userId).eq("eventId", args.eventId),
      )
      .first();
    if (existing) return existing._id;
    const runs = await ctx.db
      .query("analysisRuns")
      .withIndex("by_user_event", (q) =>
        q.eq("userId", userId).eq("eventId", args.eventId),
      )
      .collect();
    runs.sort((a, b) => a.sequence - b.sequence);
    const gaps = Math.max(0, args.expectedSegments - runs.length);
    const result = summarizeSession(
      runs.map((r) => ({
        ...(JSON.parse(r.assessmentJson) as Assessment),
        sequence: r.sequence,
        offsetSec: r.offsetSec,
      })),
      gaps,
    );
    const id = await ctx.db.insert("callLogs", {
      userId,
      eventId: args.eventId,
      source: "microphone",
      channel: "unknown",
      startedAt: args.startedAt,
      durationSec: args.durationSec,
      verdict: result.outcome,
      flags: result.flags,
      assessmentJson: JSON.stringify(result),
      coverageGaps: gaps,
      transcriptConsent: !!result.transcript,
      notificationStatus: "not_requested",
    });
    for (const row of runs) await ctx.db.delete(row._id);
    await ctx.scheduler.runAfter(0, internal.alertPolicy.enqueue, {
      userId,
      eventId: args.eventId,
    });
    return id;
  },
});
