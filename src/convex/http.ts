import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { upload, options } from "./audio";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({ path: "/audio/upload", method: "POST", handler: upload });
http.route({ path: "/audio/upload", method: "OPTIONS", handler: options });

http.route({
  path: "/alerts/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const payload = await request.text();
    if (payload.length > 65536)
      return new Response("Too large", { status: 413 });
    const ok = await ctx.runAction(internal.alerts.verifyWebhook, {
      payload,
      id: request.headers.get("svix-id") ?? "",
      timestamp: request.headers.get("svix-timestamp") ?? "",
      signature: request.headers.get("svix-signature") ?? "",
    });
    return new Response(ok ? "ok" : "Signature or event not accepted", {
      status: ok ? 200 : 503,
    });
  }),
});
export default http;
