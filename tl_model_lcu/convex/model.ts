"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { action } from "../../src/convex/_generated/server";
import type { VoiceHealth, VoiceJob } from "../../src/lib/local-voice";

export type ModelArgs = {
  operation: "health" | "session" | "submit" | "job" | "cancel";
  audioBase64?: string;
  model?: "v4" | "v5";
  id?: string;
};
export type ModelReply = VoiceHealth | VoiceJob | { connected: boolean };
const MAX_BYTES = 3 * 1024 * 1024;

export const request = action({
  args: {
    operation: v.union(v.literal("health"), v.literal("session"), v.literal("submit"), v.literal("job"), v.literal("cancel")),
    audioBase64: v.optional(v.string()),
    model: v.optional(v.union(v.literal("v4"), v.literal("v5"))),
    id: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ModelReply> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("Sign in to check a voice.");
    const endpoint = process.env.TL_MODEL_URL;
    const secret = process.env.TL_MODEL_SERVICE_SECRET;
    if (!endpoint || !secret) throw new ConvexError("The shared voice detector is not configured.");
    const base = new URL(endpoint);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
      throw new ConvexError("TL_MODEL_URL must be an HTTPS origin.");
    }
    let path: string = args.operation;
    let method = "GET";
    let body: Buffer | undefined;
    if (args.operation === "submit") {
      const encoded = args.audioBase64 ?? "";
      if (!encoded || encoded.length > 4 * Math.ceil(MAX_BYTES / 3) || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        throw new ConvexError("Choose valid audio no larger than 3 MiB.");
      }
      body = Buffer.from(encoded, "base64");
      if (!body.length || body.length > MAX_BYTES || body.toString("base64") !== encoded) {
        throw new ConvexError("Choose valid audio no larger than 3 MiB.");
      }
      method = "POST";
      path = `jobs?model=${args.model ?? "v4"}`;
    } else if (args.operation === "job" || args.operation === "cancel") {
      if (!args.id || !/^[A-Za-z0-9_-]{1,64}$/.test(args.id)) throw new ConvexError("Invalid check ID.");
      path = `jobs/${args.id}`;
      method = args.operation === "cancel" ? "DELETE" : "GET";
    }
    let response: Response;
    try {
      response = await fetch(new URL(`/api/voice/${path}`, base), {
        method, body: body ? new Uint8Array(body) : undefined,
        redirect: "error", signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${secret}`, "X-TrustLens-User": String(userId), "Content-Type": "application/octet-stream" },
      });
    } catch {
      throw new ConvexError("The shared detector is offline or unreachable. Please retry later.");
    }
    if (!response.ok) {
      const messages: Record<number, string> = {
        400: "The audio or model is invalid.", 404: "This check expired or is not yours.",
        413: "Choose audio no larger than 3 MiB.", 429: "The detector is busy or your check limit was reached. Retry in a minute.",
        503: "The model is loading or unavailable. Retry shortly.",
      };
      throw new ConvexError(messages[response.status] ?? "The shared detector could not complete this request.");
    }
    try {
      return await response.json() as ModelReply;
    } catch {
      throw new ConvexError("The shared detector returned an invalid response.");
    }
  },
});
