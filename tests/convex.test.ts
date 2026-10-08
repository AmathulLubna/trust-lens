import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "../src/convex/schema";
import { api, internal } from "../src/convex/_generated/api";
import { assess, unavailableAssessment } from "../src/lib/assessment";
const modules = import.meta.glob("../src/convex/**/*.{ts,js}");
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("ALERT_DELIVERY_ENABLED", "false");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => [
    await ctx.db.insert("users", {
      email: "owner@example.invalid",
      emailVerificationTime: 1,
    }),
    await ctx.db.insert("users", {
      email: "other@example.invalid",
      emailVerificationTime: 1,
    }),
  ]);
  return {
    t,
    owner: ids[0],
    other: ids[1],
    a: t.withIdentity({ subject: ids[0] }),
    b: t.withIdentity({ subject: ids[1] }),
  };
}
it("requires authentication before upload and checks raw server size", async () => {
  const { t, a } = await setup();
  expect(
    (
      await t.fetch("/audio/upload", {
        method: "POST",
        body: "abc",
        headers: { "X-Filename": "test.wav" },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await a.fetch("/audio/upload", {
        method: "POST",
        body: "abc",
        headers: {
          "X-Filename": "test.wav",
          "Content-Length": String(19 * 1024 * 1024),
        },
      })
    ).status,
  ).toBe(413);
  expect(
    (
      await a.fetch("/audio/upload", {
        method: "POST",
        body: "abc",
        headers: { "X-Filename": "test.exe" },
      })
    ).status,
  ).toBe(415);
});
it("owns uploads, blocks cross-user reads/deletes, deletes after analysis and stores uncertainty", async () => {
  const { t, a, b } = await setup();
  const response = await a.fetch("/audio/upload", {
    method: "POST",
    body: new Uint8Array(100),
    headers: { "X-Filename": "test.wav", "Content-Type": "audio/wav" },
  });
  expect(response.status).toBe(200);
  const { storageId } = await response.json();
  await expect(
    b.action(api.acoustic.analyze, {
      storageId,
      eventId: "upload-test-001",
      source: "upload",
      retainTranscript: false,
      language: "auto",
    }),
  ).rejects.toThrow();
  await expect(b.mutation(api.audio.remove, { storageId })).rejects.toThrow();
  const result = await a.action(api.acoustic.analyze, {
    storageId,
    eventId: "upload-test-001",
    source: "upload",
    retainTranscript: false,
    language: "auto",
  });
  expect(result.result.outcome).toBe("analysis_unavailable");
  expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
  const logs = await a.query(api.calls.list, {});
  expect(logs[0].verdict).toBe("analysis_unavailable");
  expect((await b.query(api.calls.list, {})).length).toBe(0);
});
it("preserves trained acoustic outputs through service response and consent-controlled history", async () => {
  const { a } = await setup();
  vi.stubEnv("ACOUSTIC_SERVICE_URL", "https://service.example.invalid");
  vi.stubEnv("ACOUSTIC_SERVICE_TOKEN", "test-only");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            acoustic: {
              status: "available",
              score: 0.21,
              models: ["fixture-only"],
              windows: 1,
            },
            reliability: {
              status: "usable",
              durationSec: 6,
              rms: 0.1,
              clippedFraction: 0,
            },
            transcript: "मुझे पैसे भेजो",
            contextStatus: "available",
          }),
          { status: 200 },
        ),
    ),
  );
  for (const retain of [false, true]) {
    const upload = await a.fetch("/audio/upload", {
      method: "POST",
      body: "fixture",
      headers: { "X-Filename": "test.wav" },
    });
    const { storageId } = await upload.json();
    const eventId = retain ? "consented-test" : "private-test";
    const result = await a.action(api.acoustic.analyze, {
      storageId,
      eventId,
      source: "upload",
      retainTranscript: retain,
      language: "hi",
    });
    expect(result.result.acoustic.score).toBe(0.21);
    const log = (await a.query(api.calls.list, {})).find(
      (l) => l.eventId === eventId,
    )!;
    expect(JSON.parse(log.assessmentJson!).transcript).toBe(
      retain ? "मुझे पैसे भेजो" : null,
    );
  }
});
it("finalizes once, records missing coverage and excludes late results", async () => {
  const { t, a, owner } = await setup();
  const result = unavailableAssessment();
  await t.mutation(internal.audio.storeResult, {
    userId: owner,
    eventId: "session-test",
    sequence: 0,
    offsetSec: 0,
    assessmentJson: JSON.stringify(result),
    retainTranscript: false,
    analysisStartedAt: Date.now(),
    source: "microphone",
  });
  const args = {
    eventId: "session-test",
    expectedSegments: 3,
    startedAt: Date.now(),
    durationSec: 18,
  };
  const id = await a.mutation(api.audio.finishSession, args);
  expect(await a.mutation(api.audio.finishSession, args)).toBe(id);
  expect((await a.query(api.calls.list, {}))[0].coverageGaps).toBe(2);
  await t.mutation(internal.audio.storeResult, {
    userId: owner,
    eventId: "session-test",
    sequence: 1,
    offsetSec: 6,
    assessmentJson: JSON.stringify(result),
    retainTranscript: false,
    analysisStartedAt: Date.now(),
    source: "microphone",
  });
  expect(await t.run((ctx) => ctx.db.query("analysisRuns").collect())).toEqual(
    [],
  );
});
it("does not restore private history through in-flight completion after deletion", async () => {
  const { t, a, owner } = await setup();
  const started = Date.now() - 10;
  await a.mutation(api.calls.clear, {});
  await t.mutation(internal.audio.storeResult, {
    userId: owner,
    eventId: "deleted-test",
    sequence: 0,
    offsetSec: 0,
    assessmentJson: JSON.stringify(unavailableAssessment()),
    retainTranscript: true,
    analysisStartedAt: started,
    source: "upload",
  });
  expect(await a.query(api.calls.list, {})).toEqual([]);
  await a.mutation(api.audio.recordFailure, {
    eventId: "deleted-upload-test",
    startedAt: started,
  });
  expect(await a.query(api.calls.list, {})).toEqual([]);
  await expect(
    a.mutation(api.audio.finishSession, {
      eventId: "deleted-test",
      expectedSegments: 1,
      startedAt: started,
      durationSec: 6,
    }),
  ).rejects.toThrow("deleted");
});
it("deduplicates repeated alert requests and never claims failed delivery", async () => {
  const { t, a, owner } = await setup();
  const result = assess({
    acoustic: {
      status: "available",
      score: 0.1,
      models: ["fixture"],
      windows: 1,
    },
    reliability: {
      status: "usable",
      durationSec: 6,
      rms: 0.1,
      clippedFraction: 0,
    },
    transcript: "Send money now",
    contextStatus: "available",
  });
  await t.mutation(internal.audio.storeResult, {
    userId: owner,
    eventId: "alert-test",
    sequence: 0,
    offsetSec: 0,
    assessmentJson: JSON.stringify(result),
    retainTranscript: false,
    analysisStartedAt: Date.now(),
    source: "upload",
  });
  for (let i = 0; i < 10; i++)
    await t.mutation(internal.alertPolicy.enqueue, {
      userId: owner,
      eventId: "alert-test",
    });
  const events = await t.run((ctx) => ctx.db.query("alertEvents").collect());
  expect(events.length).toBe(1);
  expect(events[0].status).toBe("disabled_or_unverified");
  expect((await a.query(api.calls.list, {}))[0].notifiedCircle).toBe(false);
});
it("requires recipient-owned verification and consent; owner cannot grant it", async () => {
  const { t, a, b, other } = await setup();
  const id = await a.mutation(api.circle.add, {
    name: "Other",
    phone: "1234567890",
    email: "other@example.invalid",
    relation: "Team",
    notifyOnFlag: true,
  });
  await expect(
    a.mutation(api.circle.consentToAlerts, { memberId: id, accept: true }),
  ).rejects.toThrow();
  await b.mutation(api.circle.consentToAlerts, { memberId: id, accept: true });
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.recipientConsent).toBe(true);
  await t.run((ctx) =>
    ctx.db.patch(other, { emailVerificationTime: undefined }),
  );
  await expect(
    b.mutation(api.circle.consentToAlerts, { memberId: id, accept: true }),
  ).rejects.toThrow();
});
it("honors disabled preferences even when delivery is enabled", async () => {
  const { t, a, b, owner } = await setup();
  vi.stubEnv("ALERT_DELIVERY_ENABLED", "true");
  await a.mutation(api.settings.update, { autoNotifyCircle: false });
  const memberId = await a.mutation(api.circle.add, {
    name: "Other",
    phone: "1234567890",
    email: "other@example.invalid",
    relation: "Team",
    notifyOnFlag: true,
  });
  await b.mutation(api.circle.consentToAlerts, { memberId, accept: true });
  await t.run((ctx) =>
    ctx.db.insert("callLogs", {
      userId: owner,
      eventId: "prefs-test",
      source: "upload",
      channel: "unknown",
      startedAt: Date.now(),
      verdict: "suspicious",
      flags: [],
    }),
  );
  await t.mutation(internal.alertPolicy.enqueue, {
    userId: owner,
    eventId: "prefs-test",
  });
  const events = await t.run((ctx) => ctx.db.query("alertEvents").collect());
  expect(events[0].status).toBe("disabled_or_unverified");
});
it("records provider failures truthfully and deduplicates accepted delivery events", async () => {
  const { t, a, b, owner } = await setup();
  vi.stubEnv("ALERT_DELIVERY_ENABLED", "true");
  vi.stubEnv("RESEND_FROM", "alerts@verified.example.invalid");
  vi.stubEnv("RESEND_API_KEY", "test-only-key");
  await a.mutation(api.settings.update, { autoNotifyCircle: true });
  const memberId = await a.mutation(api.circle.add, {
    name: "Other",
    phone: "1234567890",
    email: "other@example.invalid",
    relation: "Team",
    notifyOnFlag: true,
  });
  await b.mutation(api.circle.consentToAlerts, { memberId, accept: true });
  await t.run((ctx) =>
    ctx.db.insert("callLogs", {
      userId: owner,
      eventId: "provider-test",
      source: "upload",
      channel: "unknown",
      startedAt: Date.now(),
      verdict: "suspicious",
      flags: [],
    }),
  );
  await t.mutation(internal.alertPolicy.enqueue, {
    userId: owner,
    eventId: "provider-test",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "rejected" }), { status: 403 }),
    ),
  );
  await t.action(internal.alerts.deliver, {
    userId: owner,
    eventId: "provider-test",
  });
  expect((await a.query(api.calls.list, {}))[0].notificationStatus).toBe(
    "failed",
  );
  expect((await a.query(api.calls.list, {}))[0].notifiedCircle).toBe(false);
  await t.mutation(internal.alertPolicy.update, {
    userId: owner,
    eventId: "provider-test",
    status: "accepted_by_provider",
    providerIds: ["provider-id"],
  });
  expect((await a.query(api.calls.list, {}))[0].notifiedCircle).toBe(false);
  for (let i = 0; i < 2; i++)
    await t.mutation(internal.alertPolicy.webhookUpdate, {
      providerId: "provider-id",
      type: "email.delivered",
    });
  expect((await a.query(api.calls.list, {}))[0].notificationStatus).toBe(
    "delivered",
  );
  expect(
    await t.action(internal.alerts.verifyWebhook, {
      payload: "{}",
      id: "forged",
      timestamp: "0",
      signature: "invalid",
    }),
  ).toBe(false);
});
it("protects notes and reporter identifiers and keeps legitimate reports separate", async () => {
  const { t, a, b } = await setup();
  await a.mutation(api.numbers.reportNumber, {
    number: "9876543210",
    display: "9876543210",
    category: "legit",
    note: "private note",
  });
  await expect(
    t.query(api.numbers.reportsForNumber, { number: "919876543210" }),
  ).rejects.toThrow();
  const aggregate = await b.query(api.numbers.reportsForNumber, {
    number: "919876543210",
  });
  expect(aggregate.counts).toEqual({ legit: 1 });
  expect(JSON.stringify(aggregate)).not.toContain("private note");
  expect(JSON.stringify(aggregate)).not.toContain("userId");
  const check = await b.action(api.numberLookup.lookup, {
    number: "9876543210",
  });
  expect(check.ok && check.verdict).toBe("inconclusive");
  await expect(
    a.mutation(api.numbers.reportNumber, {
      number: "9876543210",
      display: "9876543210",
      category: "unknown",
    }),
  ).rejects.toThrow();
});

it("records interrupted notification attempts as unknown, never delivered", async () => {
  const { t, a, owner } = await setup();
  await t.run(async (ctx) => {
    await ctx.db.insert("callLogs", {
      userId: owner,
      eventId: "lost-action",
      source: "upload",
      channel: "unknown",
      startedAt: Date.now(),
      verdict: "suspicious",
      flags: [],
    });
    await ctx.db.insert("alertEvents", {
      userId: owner,
      eventId: "lost-action",
      status: "sending",
      recipients: ["fixture@example.invalid"],
      createdAt: Date.now(),
    });
  });
  await t.mutation(internal.alertPolicy.expireSending, {
    userId: owner,
    eventId: "lost-action",
  });
  expect((await a.query(api.calls.list, {}))[0].notificationStatus).toBe(
    "delivery_unknown",
  );
  expect((await a.query(api.calls.list, {}))[0].notifiedCircle).toBe(false);
});

it("accepts only authentic signed provider delivery confirmations", async () => {
  const { t, a, owner } = await setup();
  const secret = Buffer.alloc(32, 7).toString("base64");
  vi.stubEnv("RESEND_API_KEY", "fixture-only");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_" + secret);
  await t.run(async (ctx) => {
    await ctx.db.insert("callLogs", {
      userId: owner,
      eventId: "signed-delivery",
      source: "upload",
      channel: "unknown",
      startedAt: Date.now(),
      verdict: "suspicious",
      flags: [],
    });
    await ctx.db.insert("alertEvents", {
      userId: owner,
      eventId: "signed-delivery",
      status: "accepted_by_provider",
      recipients: ["fixture@example.invalid"],
      providerIds: ["signed-provider-id"],
      createdAt: Date.now(),
    });
  });
  const id = "fixture-webhook-id",
    timestamp = String(Math.floor(Date.now() / 1000)),
    payload = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "signed-provider-id" },
    });
  const signature =
    "v1," +
    createHmac("sha256", Buffer.from(secret, "base64"))
      .update(id + "." + timestamp + "." + payload)
      .digest("base64");
  expect(
    await t.action(internal.alerts.verifyWebhook, {
      payload: payload + " ",
      id,
      timestamp,
      signature,
    }),
  ).toBe(false);
  expect(
    await t.action(internal.alerts.verifyWebhook, {
      payload,
      id,
      timestamp,
      signature,
    }),
  ).toBe(true);
  expect((await a.query(api.calls.list, {}))[0].notificationStatus).toBe(
    "delivered",
  );
});

it("stores message outcomes without retaining unconsented text and isolates check history", async () => {
  const { a, b } = await setup();
  for (const text of ["shopping", "never share your OTP"]) {
    const result = await a.action(api.messageCheck.check, { text });
    expect(result.ok && result.verdict).toBe("no_strong_indicators");
  }
  const result = await a.action(api.messageCheck.check, {
    text: "मुझे पैसे भेजो",
    retainText: true,
  });
  expect(result.ok && result.verdict).toBe("suspicious");
  const history = await a.query(api.messages.history, {});
  expect(history.filter((m) => m.messagePreview)).toHaveLength(1);
  expect(await b.query(api.messages.history, {})).toEqual([]);
});

it("enforces actual streamed bytes even when content length lies", async () => {
  const { a, t } = await setup();
  const response = await a.fetch("/audio/upload", {
    method: "POST",
    body: new Uint8Array(18 * 1024 * 1024 + 1),
    headers: { "X-Filename": "oversize.wav", "Content-Length": "1" },
  });
  expect(response.status).toBe(413);
  expect(await t.run((ctx) => ctx.db.query("audioUploads").collect())).toEqual(
    [],
  );
});
