import { describe, expect, it } from "vitest";
import {
  scamFlagsFromText,
  normalizedTranscriptText,
  calibrateVerdict,
  hasRelationClaim,
} from "../src/lib/trustlens";
import {
  assess,
  retainedAssessment,
  serviceResultSchema,
  summarizeSession,
  unavailableAssessment,
  type ServiceResult,
} from "../src/lib/assessment";
import { SegmentQueue } from "../src/lib/segment-queue";
import { eligibleRecipients } from "../src/lib/alert-policy";
const sample: ServiceResult = {
  acoustic: {
    status: "available",
    score: 0.12,
    models: ["fixture-model"],
    windows: 1,
  },
  reliability: {
    status: "usable",
    durationSec: 6,
    rms: 0.1,
    clippedFraction: 0,
  },
  transcript: "hello",
  contextStatus: "available",
};
describe("truthful outcomes and language", () => {
  it.each([
    "We are shopping tomorrow.",
    "Never share your OTP or password with anyone.",
    "Please don't send money.",
    'Scam example: "send money now".',
    "अपना ओटीपी कभी साझा मत करें",
  ])("does not mistake advice or token substrings for a request: %s", (text) =>
    expect(scamFlagsFromText(text)).toEqual([]),
  );
  it.each([
    "मुझे पैसे भेजो",
    "Please send ₹40,000 right now",
    "Send me your OTP",
    "Please authorize the beneficiary change in the corporate portal.",
  ])("recognizes sensitive requests: %s", (text) =>
    expect(scamFlagsFromText(text).length).toBeGreaterThan(0),
  );
  it("retains Hindi marks and relation claims", () => {
    expect(normalizedTranscriptText("मैं पापा बोल रहा हूँ")).toBe(
      "मैं पापा बोल रहा हूँ",
    );
    expect(hasRelationClaim("मैं पापा बोल रहा हूँ")).toBe(true);
  });
  it("does not downgrade unmatched model findings", () => {
    expect(
      calibrateVerdict("flagged", [], "Please authorize an unfamiliar action"),
    ).toBe("flagged");
    expect(calibrateVerdict("safe", [], "")).toBe("inconclusive");
  });
  it("preserves availability and silence", () => {
    expect(unavailableAssessment().outcome).toBe("analysis_unavailable");
    expect(
      assess({
        ...sample,
        acoustic: {
          status: "insufficient_audio",
          score: null,
          models: [],
          windows: 0,
        },
        reliability: { ...sample.reliability, status: "insufficient" },
        transcript: null,
        contextStatus: "insufficient_audio",
      }).outcome,
    ).toBe("insufficient_audio");
    expect(
      assess({
        ...sample,
        contextStatus: "analysis_unavailable",
        transcript: null,
      }).outcome,
    ).toBe("inconclusive");
  });
  it("keeps acoustic outputs invariant under transcript changes", () => {
    const request = assess({ ...sample, transcript: "मुझे पैसे भेजो" });
    expect(request.outcome).toBe("suspicious");
    expect(request.acoustic).toEqual(sample.acoustic);
    expect(assess(sample).outcome).toBe("no_strong_indicators");
  });
  it("rejects unknown or inconsistent service outputs", () => {
    expect(
      serviceResultSchema.safeParse({
        ...sample,
        acoustic: { ...sample.acoustic, status: "safe" },
      }).success,
    ).toBe(false);
    expect(
      serviceResultSchema.safeParse({
        ...sample,
        acoustic: { ...sample.acoustic, score: null },
      }).success,
    ).toBe(false);
    expect(
      serviceResultSchema.safeParse({ ...sample, transcript: "" }).success,
    ).toBe(false);
  });
  it("requires transcript consent and exposes gaps", () => {
    expect(retainedAssessment(assess(sample), false).transcript).toBeNull();
    expect(retainedAssessment(assess(sample), true).transcript).toBe("hello");
    expect(summarizeSession([assess(sample)], 1).outcome).toBe("inconclusive");
  });
  it("preserves final acoustic evidence by timestamp without inventing a session probability", () => {
    const result = summarizeSession(
      [
        { ...assess(sample), sequence: 2, offsetSec: 12 },
        {
          ...assess({
            ...sample,
            acoustic: { ...sample.acoustic, score: 0.4 },
          }),
          sequence: 3,
          offsetSec: 18,
        },
      ],
      0,
    );
    expect(result.acoustic.score).toBeNull();
    expect(
      result.segments?.map((s) => [s.sequence, s.offsetSec, s.acoustic.score]),
    ).toEqual([
      [2, 12, 0.12],
      [3, 18, 0.4],
    ]);
  });
});
describe("bounded, isolated session processing", () => {
  it("marks overload gaps while preserving original sequence and timestamps", async () => {
    let release!: () => void;
    const blocker = new Promise<void>((r) => (release = r));
    const results: number[] = [];
    const queue = new SegmentQueue<number, number>(
      async (s) => {
        if (s.sequence === 0) await blocker;
        return s.sequence;
      },
      (r) => results.push(r),
      () => {},
      2,
    );
    for (let i = 0; i < 5; i++) queue.push(i, i * 6, 6);
    expect(queue.gaps.map((g) => [g.sequence, g.offsetSec])).toEqual([
      [3, 18],
      [4, 24],
    ]);
    release();
    await queue.finish(1000);
    expect(results).toEqual([0, 1, 2]);
    expect(queue.expectedSegments).toBe(5);
  });
  it("drains an in-flight request and finalizes once", async () => {
    let release!: (v: number) => void;
    const results: number[] = [];
    const q = new SegmentQueue<number, number>(
      () => new Promise((r) => (release = r)),
      (r) => results.push(r),
      () => {},
    );
    q.push(1, 0, 6);
    const first = q.finish(1000);
    expect(q.finish()).toBe(first);
    release(9);
    await first;
    expect(results).toEqual([9]);
    q.push(2, 6, 6);
    expect(q.expectedSegments).toBe(1);
  });
  it("ignores late old-session callbacks after deadline and restart", async () => {
    let release!: (v: number) => void;
    const old: number[] = [];
    const q = new SegmentQueue<number, number>(
      () => new Promise((r) => (release = r)),
      (r) => old.push(r),
      () => {},
    );
    q.push(1, 0, 6);
    await q.finish(5);
    expect(q.gaps.length).toBe(1);
    const fresh: number[] = [];
    const next = new SegmentQueue<number, number>(
      async () => 2,
      (r) => fresh.push(r),
      () => {},
    );
    next.push(2, 0, 6);
    await next.finish();
    release(1);
    await Promise.resolve();
    expect(old).toEqual([]);
    expect(fresh).toEqual([2]);
  });
  it("makes network errors visible", async () => {
    const q = new SegmentQueue(
      async () => {
        throw Error("offline");
      },
      () => {},
      () => {},
    );
    q.push("audio", 12, 6);
    await q.finish();
    expect(q.gaps[0].offsetSec).toBe(12);
  });
});
it("requires both preference and recipient verification/consent", () => {
  const recipient = {
    email: "test@example.invalid",
    notifyOnFlag: true,
    recipientVerifiedAt: 1,
    recipientConsent: true,
  };
  expect(
    eligibleRecipients(true, { autoNotifyCircle: false }, [recipient]),
  ).toEqual([]);
  expect(
    eligibleRecipients(false, { autoNotifyCircle: true }, [recipient]),
  ).toEqual([]);
  expect(
    eligibleRecipients(true, { autoNotifyCircle: true }, [
      { ...recipient, recipientConsent: false },
    ]),
  ).toEqual([]);
  expect(
    eligibleRecipients(true, { autoNotifyCircle: true }, [
      recipient,
      recipient,
    ]),
  ).toEqual([recipient.email]);
});
