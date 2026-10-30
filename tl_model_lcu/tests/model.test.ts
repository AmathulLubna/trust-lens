import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../src/convex/schema";
import type { ModelArgs, ModelReply } from "../convex/model";

const modules = {
  ...import.meta.glob("../../src/convex/**/*.{ts,js}"),
  "../../src/convex/laptopModel.ts": () => import("../convex/model"),
};
const request = makeFunctionReference<"action", ModelArgs, ModelReply>("laptopModel:request");

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run(ctx => ctx.db.insert("users", { name: "Gateway test" }));
  vi.stubEnv("TL_MODEL_URL", "https://detector.example.com");
  vi.stubEnv("TL_MODEL_SERVICE_SECRET", "server-secret-" + "x".repeat(40));
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ connected: true })));
  vi.stubGlobal("fetch", fetch);
  return { t, user: t.withIdentity({ subject: userId }), userId, fetch };
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Convex to shared laptop", () => {
  it("requires authentication and sends the verified user identity only on the backend", async () => {
    const { t, user, userId, fetch } = await setup();
    await expect(t.action(request, { operation: "session" })).rejects.toThrow("Sign in");
    expect(fetch).not.toHaveBeenCalled();
    expect(await user.action(request, { operation: "session" })).toEqual({ connected: true });
    expect(fetch.mock.calls[0][0].href).toBe("https://detector.example.com/api/voice/session");
    expect(fetch.mock.calls[0][1].headers["X-TrustLens-User"]).toBe(userId);
    expect(fetch.mock.calls[0][1].headers.Authorization).toContain("server-secret-");
    expect(fetch.mock.calls[0][1].redirect).toBe("error");
  });

  it("forwards actual audio bytes and the selected model", async () => {
    const { user, fetch } = await setup();
    await user.action(request, { operation: "submit", audioBase64: Buffer.from("actual audio").toString("base64"), model: "v5" });
    expect(fetch.mock.calls[0][0].href).toBe("https://detector.example.com/api/voice/jobs?model=v5");
    expect(Buffer.from(fetch.mock.calls[0][1].body).toString()).toBe("actual audio");
    expect(fetch.mock.calls[0][1].method).toBe("POST");
  });

  it("rejects oversized/malformed audio and invalid job IDs before contacting the laptop", async () => {
    const { user, fetch } = await setup();
    for (const audioBase64 of ["!!!", "YQ", "a".repeat(4 * 1024 * 1024 + 4)]) {
      await expect(user.action(request, { operation: "submit", audioBase64 })).rejects.toThrow("3 MiB");
    }
    await expect(user.action(request, { operation: "job", id: "../pairing" })).rejects.toThrow("Invalid check ID");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports offline and overloaded states without leaking configuration", async () => {
    const { user, fetch } = await setup();
    fetch.mockRejectedValueOnce(new Error("private upstream details"));
    await expect(user.action(request, { operation: "health" })).rejects.toThrow("offline");
    fetch.mockResolvedValueOnce(new Response("secret upstream error", { status: 429 }));
    await expect(user.action(request, { operation: "submit", audioBase64: "YXVkaW8=" })).rejects.toThrow("busy");
    vi.stubEnv("TL_MODEL_URL", "http://127.0.0.1:8766");
    await expect(user.action(request, { operation: "health" })).rejects.toThrow("HTTPS origin");
  });
});
