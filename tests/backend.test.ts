import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import axios from "axios";
import schema from "../src/convex/schema";
import { api, internal } from "../src/convex/_generated/api";

const modules = import.meta.glob("../src/convex/**/*.{ts,js}");

async function setup(autoNotify = true) {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Test User" });
    await ctx.db.insert("userSettings", {
      userId,
      autoNotifyCircle: autoNotify,
    });
    await ctx.db.insert("trustedCircle", {
      userId,
      name: "Contact",
      phone: "1234567890",
      email: "test@example.com",
      relation: "friend",
      notifyOnFlag: true,
      addedAt: 0,
    });
    return userId;
  });
  return { t, userId, user: t.withIdentity({ subject: userId }) };
}

const call = {
  sessionId: "test-session",
  channel: "unknown" as const,
  startedAt: 1000,
  durationSec: 30,
  verdict: "flagged" as const,
  riskScore: 85,
  flags: [],
  transcript: [
    { speaker: "caller" as const, text: "Private conversation", t: 1 },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("GROQ_API_KEY", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("transcript privacy and ledger ownership", () => {
  it("does not persist a supplied transcript without explicit consent", async () => {
    const { t, user } = await setup(false);
    const id = await user.mutation(api.calls.record, call);
    expect((await t.run((ctx) => ctx.db.get(id)))?.transcript).toBeUndefined();
  });
  it("persists an opted-in transcript and deduplicates retries", async () => {
    const { t, user } = await setup(false);
    const id = await user.mutation(api.calls.record, {
      ...call,
      archiveTranscript: true,
    });
    expect(
      await user.mutation(api.calls.record, {
        ...call,
        archiveTranscript: true,
      }),
    ).toBe(id);
    expect((await t.run((ctx) => ctx.db.get(id)))?.transcript).toEqual(
      call.transcript,
    );
    expect(await user.query(api.calls.list)).toHaveLength(1);
    expect(await t.query(api.calls.list)).toEqual([]);
  });
  it("rejects anonymous ledger writes", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.calls.record, call)).rejects.toThrow(
      "Not authenticated",
    );
  });
  it("clears pending alert metadata with the ledger", async () => {
    const { t, user } = await setup();
    await user.mutation(api.calls.record, call);
    await user.mutation(api.calls.clear);
    expect(await user.query(api.calls.list)).toEqual([]);
    expect(
      await t.run((ctx) => ctx.db.query("circleAlerts").collect()),
    ).toEqual([]);
  });
});

describe("circle notifications", () => {
  it("routes flagged AI results through preferences and the same session reservation", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.spyOn(axios, "post").mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                verdict: "flagged",
                confidence: 90,
                summary: "Private summary",
                markers: [],
              }),
            },
          },
        ],
      },
    });
    const { t, user } = await setup(false);
    const args = {
      sessionId: call.sessionId,
      transcript: [{ speaker: "caller", text: "Send money immediately." }],
      flags: [{ id: "money", label: "Requests money", severity: "critical" }],
    };
    expect((await user.action(api.analyze.groqVerdict, args)).verdict).toBe(
      "flagged",
    );
    expect(
      await t.run((ctx) => ctx.db.query("circleAlerts").collect()),
    ).toEqual([]);
    await user.mutation(api.settings.update, { autoNotifyCircle: true });
    await user.action(api.analyze.groqVerdict, args);
    await user.action(api.analyze.groqVerdict, args);
    await user.mutation(api.calls.record, call);
    expect(
      await t.run((ctx) => ctx.db.query("circleAlerts").collect()),
    ).toHaveLength(1);
  });
  it("honors global opt-out in both live analysis and archive paths", async () => {
    const { t, user, userId } = await setup(false);
    await t.mutation(internal.alertQueue.request, {
      userId,
      sessionId: call.sessionId,
    });
    await user.mutation(api.calls.record, call);
    expect(
      await t.run((ctx) => ctx.db.query("circleAlerts").collect()),
    ).toEqual([]);
  });
  it("reserves one alert across repeated analysis and archive requests", async () => {
    const { t, user, userId } = await setup();
    await t.mutation(internal.alertQueue.request, {
      userId,
      sessionId: call.sessionId,
    });
    await t.mutation(internal.alertQueue.request, {
      userId,
      sessionId: call.sessionId,
    });
    await user.mutation(api.calls.record, call);
    const alerts = await t.run((ctx) => ctx.db.query("circleAlerts").collect());
    expect(alerts).toHaveLength(1);
    expect(alerts[0].status).toBe("queued");
    expect((await user.query(api.calls.list))[0].notifiedCircle).toBe(false);
  });
  it("rechecks preferences before delivery and omits conversation content", async () => {
    const { t, user, userId } = await setup();
    await t.mutation(internal.alertQueue.request, {
      userId,
      sessionId: call.sessionId,
    });
    const [alert] = await t.run((ctx) =>
      ctx.db.query("circleAlerts").collect(),
    );
    expect(
      await t.query(internal.alertQueue.delivery, { alertId: alert._id }),
    ).toEqual({
      who: "Test User",
      when: alert.createdAt,
      emails: ["test@example.com"],
    });
    await user.mutation(api.settings.update, { autoNotifyCircle: false });
    expect(
      await t.query(internal.alertQueue.delivery, { alertId: alert._id }),
    ).toBeNull();
  });
  it("marks notified only after successful email submission", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "alerts@example.com");
    const post = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ data: { id: "email" } });
    const { t, user } = await setup();
    await user.mutation(api.calls.record, call);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(post).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(post.mock.calls)).not.toContain(
      "Private conversation",
    );
    expect((await user.query(api.calls.list))[0].notifiedCircle).toBe(true);
  });
  it("does not mark failed deliveries as notified", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "alerts@example.com");
    vi.spyOn(axios, "post").mockRejectedValue({
      response: {
        status: 403,
        data: { message: "Sending is restricted to private@example.com" },
      },
    });
    const { t, user } = await setup();
    await user.mutation(api.calls.record, call);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await user.query(api.calls.list))[0].notifiedCircle).toBe(false);
    expect(
      (await t.run((ctx) => ctx.db.query("circleAlerts").collect()))[0].status,
    ).toBe("failed");
    expect(warning).toHaveBeenCalled();
    expect(JSON.stringify(warning.mock.calls)).toContain("403");
    expect(JSON.stringify(warning.mock.calls)).not.toContain(
      "private@example.com",
    );
  });
});

describe("number reports", () => {
  it("keeps AI-upgraded scores and recorded verdicts in the same band", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.spyOn(axios, "post").mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                verdict: "flagged",
                confidence: 90,
                explanation: "Check separately",
                markers: ["Potential impersonation"],
              }),
            },
          },
        ],
      },
    });
    const { user } = await setup(false);
    const result = await user.action(api.numberLookup.lookup, {
      number: "9823456718",
    });
    expect(result.riskScore).toBe(70);
    expect(result.verdict).toBe("flagged");
    expect(result.reasons).toContain("AI: Potential impersonation");
    expect((await user.query(api.numbers.history))[0].riskScore).toBe(70);
  });
  it("requires authentication and excludes reporter identifiers", async () => {
    const { t, user } = await setup(false);
    await user.mutation(api.numbers.reportNumber, {
      number: "9823456718",
      display: "9823456718",
      category: "legit",
      note: "Verified separately",
    });
    await expect(
      t.query(api.numbers.reportsForNumber, { number: "919823456718" }),
    ).rejects.toThrow("Not authenticated");
    const reports = await user.query(api.numbers.reportsForNumber, {
      number: "9823456718",
    });
    expect(reports).toHaveLength(1);
    expect(Object.keys(reports[0]).sort()).toEqual([
      "category",
      "createdAt",
      "note",
    ]);
  });
  it("safe reports add no risk and replacing a scam report removes its contribution", async () => {
    const { user } = await setup(false);
    const report = { number: "9823456718", display: "9823456718" };
    await user.mutation(api.numbers.reportNumber, {
      ...report,
      category: "scam-call",
    });
    expect(
      (await user.action(api.numberLookup.lookup, { number: report.number }))
        .riskScore,
    ).toBe(12);
    await user.mutation(api.numbers.reportNumber, {
      ...report,
      category: "legit",
    });
    const result = await user.action(api.numberLookup.lookup, {
      number: report.number,
    });
    expect(result.riskScore).toBe(0);
    expect(result.verdict).toBe("safe");
  });
});
