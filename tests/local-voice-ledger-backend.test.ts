import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import axios from "axios";
import schema from "../src/convex/schema";
import { api } from "../src/convex/_generated/api";

const modules = import.meta.glob("../src/convex/**/*.{ts,js}");
const result = { model: "v4" as const, score: 0.8, threshold: 0.51881, seconds: 20.45, windows: 4, checkTimeSec: 11.67 };
const args = { sessionId: "local-voice:test", result, alertCircle: false };

async function setup(autoNotify = true, contacts = true) {
  const t = convexTest(schema, modules);
  const userId = await t.run(async ctx => {
    const id = await ctx.db.insert("users", { name: "Test user" });
    await ctx.db.insert("userSettings", { userId: id, autoNotifyCircle: autoNotify });
    if (contacts) await ctx.db.insert("trustedCircle", {
      userId: id, name: "Enabled contact", phone: "123", email: "contact@example.com",
      relation: "friend", notifyOnFlag: true, addedAt: 0,
    });
    return id;
  });
  return { t, user: t.withIdentity({ subject: userId }), userId };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "alerts@example.com");
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("explicit local voice ledger actions", () => {
  it("saves an AI-like result silently even with automatic alerts enabled and deduplicates retries", async () => {
    const { t, user } = await setup();
    const id = await user.mutation(api.calls.recordLocalVoice, args);
    expect(await user.mutation(api.calls.recordLocalVoice, args)).toBe(id);
    const logs = await user.query(api.calls.list);
    expect(logs).toHaveLength(1);
    expect(logs[0].localVoice).toMatchObject({ ...result, vote: "AI-like", assessment: "Inconclusive" });
    expect(logs[0].transcript).toBeUndefined();
    expect(logs[0].notifiedCircle).toBe(false);
    expect(await t.run(ctx => ctx.db.query("circleAlerts").collect())).toEqual([]);
    expect(await user.query(api.calls.localVoiceArchiveStatus, { sessionId: args.sessionId })).toEqual({ saved: true, alertStatus: "not_requested" });
  });

  it("preserves a human-like assessment and rejects attempts to alert for it", async () => {
    const { t, user } = await setup();
    const human = { ...args, result: { ...result, score: 0.01164 } };
    await expect(user.mutation(api.calls.recordLocalVoice, { ...human, alertCircle: true })).rejects.toThrow("only for AI-like");
    expect(await user.query(api.calls.list)).toEqual([]);
    await user.mutation(api.calls.recordLocalVoice, human);
    const [log] = await user.query(api.calls.list);
    expect(log.localVoice?.vote).toBe("human-like");
    expect(log.localVoice?.assessment).toBe("Inconclusive");
    expect(log.verdict).not.toBe("safe");
    expect(await t.run(ctx => ctx.db.query("circleAlerts").collect())).toEqual([]);
  });

  it("can explicitly alert after saving without duplicating the ledger or email, even when automatic alerts are off", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { id: "email" } });
    const { t, user } = await setup(false);
    const id = await user.mutation(api.calls.recordLocalVoice, args);
    expect(await user.mutation(api.calls.recordLocalVoice, { ...args, alertCircle: true })).toBe(id);
    await user.mutation(api.calls.recordLocalVoice, { ...args, alertCircle: true });
    expect(await user.query(api.calls.localVoiceArchiveStatus, { sessionId: args.sessionId })).toMatchObject({ alertStatus: "queued" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toMatchObject({ text: expect.stringContaining("assessment is inconclusive") });
    expect(await user.query(api.calls.list)).toHaveLength(1);
    expect(await user.query(api.calls.localVoiceArchiveStatus, { sessionId: args.sessionId })).toEqual({ saved: true, alertStatus: "sent" });
    expect((await user.query(api.calls.list))[0].notifiedCircle).toBe(true);
  });

  it("saves the result and reports deferred email setup without claiming an alert was sent", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    const { t, user } = await setup();
    await user.mutation(api.calls.recordLocalVoice, { ...args, alertCircle: true });
    expect(await user.query(api.calls.localVoiceArchiveStatus, { sessionId: args.sessionId })).toEqual({ saved: true, alertStatus: "not_configured" });
    expect(await t.run(ctx => ctx.db.query("circleAlerts").collect())).toEqual([]);
  });

  it("reports missing contacts and excludes contacts with alerts disabled", async () => {
    const { t, user, userId } = await setup(true, false);
    await t.run(ctx => ctx.db.insert("trustedCircle", {
      userId, name: "Disabled", phone: "123", email: "disabled@example.com", relation: "friend", notifyOnFlag: false, addedAt: 0,
    }));
    await user.mutation(api.calls.recordLocalVoice, { ...args, alertCircle: true });
    expect(await user.query(api.calls.localVoiceArchiveStatus, { sessionId: args.sessionId })).toEqual({ saved: true, alertStatus: "no_contacts" });
    expect(await t.run(ctx => ctx.db.query("circleAlerts").collect())).toEqual([]);
  });

  it("retries failed email delivery without duplicating the saved result or claiming earlier success", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const post = vi.spyOn(axios, "post").mockRejectedValueOnce(new Error("Provider unavailable")).mockResolvedValue({ data: { id: "email" } });
    const { t, user } = await setup();
    await user.mutation(api.calls.recordLocalVoice, { ...args, alertCircle: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await user.query(api.calls.localVoiceArchiveStatus, { sessionId: args.sessionId })).toMatchObject({ alertStatus: "failed" });
    expect((await user.query(api.calls.list))[0].notifiedCircle).toBe(false);
    await user.mutation(api.calls.recordLocalVoice, { ...args, alertCircle: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(post).toHaveBeenCalledTimes(2);
    expect(await user.query(api.calls.list)).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("circleAlerts").collect())).toHaveLength(1);
    expect(await user.query(api.calls.localVoiceArchiveStatus, { sessionId: args.sessionId })).toMatchObject({ alertStatus: "sent" });
  });

  it("requires authentication, keeps records private, and rejects invalid or changed results", async () => {
    const { t, user } = await setup();
    await expect(t.mutation(api.calls.recordLocalVoice, args)).rejects.toThrow("Not authenticated");
    await expect(user.mutation(api.calls.recordLocalVoice, { ...args, result: { ...result, score: 12 } })).rejects.toThrow("Invalid local voice result");
    await user.mutation(api.calls.recordLocalVoice, args);
    await expect(user.mutation(api.calls.recordLocalVoice, { ...args, result: { ...result, score: 0.1 } })).rejects.toThrow("different result");
    expect(await t.query(api.calls.localVoiceArchiveStatus, { sessionId: args.sessionId })).toBeNull();
    const otherId = await t.run(ctx => ctx.db.insert("users", { name: "Other user" }));
    const other = t.withIdentity({ subject: otherId });
    expect(await other.query(api.calls.localVoiceArchiveStatus, { sessionId: args.sessionId })).toMatchObject({ saved: false });
    expect(await other.query(api.calls.list)).toEqual([]);
  });
});
