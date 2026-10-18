// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { useLiveVoice } from "../src/hooks/use-live-voice";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  analyze: vi.fn(),
  transcribe: vi.fn(),
  verdict: vi.fn(),
  record: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useAction: (fn: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(fn).endsWith("groqTranscribe")
      ? mocks.transcribe
      : mocks.verdict,
  useMutation: () => mocks.record,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../src/lib/voice-analysis", () => ({
  VoiceAnalyzer: class {
    start = mocks.start;
    stop = mocks.stop;
    analyze = mocks.analyze;
  },
}));

class Recorder {
  static isTypeSupported() {
    return true;
  }
  state = "inactive";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    Promise.resolve().then(() => {
      this.ondataavailable?.({
        data: new Blob(["test audio"], { type: "audio/webm" }),
      });
      this.onstop?.();
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("Blob", NodeBlob);
  mocks.start.mockResolvedValue({});
  mocks.analyze.mockReturnValue({
    voiced: true,
    pitchHz: 200,
    jitterPct: 5,
    flatness: 0.2,
    rolloff: 0.2,
    confidence: 10,
    rms: 0.2,
  });
  mocks.transcribe.mockResolvedValue({ ok: true, text: "hello how are you" });
  mocks.verdict.mockResolvedValue({
    ok: true,
    verdict: "safe",
    confidence: 10,
    summary: "No markers",
    markers: [],
  });
  mocks.record.mockResolvedValue("record-id");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("does not spend AI quota before speech arrives or while the transcript is unchanged", async () => {
  const { result } = renderHook(() => useLiveVoice());
  await act(async () => {
    await result.current.startMic();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(mocks.verdict).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
  expect(mocks.verdict).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(mocks.verdict).toHaveBeenCalledTimes(1);
});

it("coalesces transcript updates received while an AI verdict is pending", async () => {
  let release!: (value: unknown) => void;
  mocks.verdict.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const { result } = renderHook(() => useLiveVoice());
  await act(async () => {
    await result.current.startMic();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(18_000);
  });
  expect(mocks.verdict).toHaveBeenCalledTimes(1);
  expect(result.current.transcript).toHaveLength(3);
  await act(async () => {
    release({
      ok: true,
      verdict: "safe",
      confidence: 10,
      summary: "No markers",
      markers: [],
    });
  });
  expect(mocks.verdict).toHaveBeenCalledTimes(2);
  expect(mocks.verdict.mock.calls[1][0].transcript).toHaveLength(3);
});

it("queues slow chunks and waits for the final recording before archiving without transcript consent", async () => {
  let release!: (result: { ok: boolean; text: string }) => void;
  mocks.transcribe.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const { result } = renderHook(() => useLiveVoice());
  await act(async () => {
    await result.current.startMic();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(12_000);
  });
  expect(mocks.transcribe).toHaveBeenCalledTimes(1);
  let ended!: Promise<void>;
  await act(async () => {
    ended = result.current.endSession();
    await Promise.resolve();
  });
  expect(mocks.record).not.toHaveBeenCalled();
  await act(async () => {
    release({ ok: true, text: "first chunk" });
    await ended;
  });
  expect(mocks.transcribe).toHaveBeenCalledTimes(3);
  expect(result.current.transcript).toHaveLength(3);
  expect(mocks.verdict.mock.calls.at(-1)?.[0].transcript).toHaveLength(3);
  expect(mocks.record).toHaveBeenCalledTimes(1);
  expect(mocks.record.mock.calls[0][0]).toMatchObject({
    archiveTranscript: false,
    transcript: undefined,
  });
  expect(result.current.saved).toBe(true);
});

it("does not archive a silent session as safe", async () => {
  mocks.transcribe.mockResolvedValue({
    ok: false,
    message: "No speech detected.",
  });
  const { result } = renderHook(() => useLiveVoice());
  await act(async () => {
    await result.current.startMic();
  });
  await act(async () => {
    await result.current.endSession();
  });
  expect(mocks.record).not.toHaveBeenCalled();
  expect(result.current.micError).toContain("No clear speech");
  expect(result.current.sessionActive).toBe(true);
});

it("archives the transcript only after opting in", async () => {
  const { result } = renderHook(() => useLiveVoice());
  act(() => result.current.setSaveTranscript(true));
  await act(async () => {
    await result.current.startMic();
  });
  await act(async () => {
    await result.current.endSession();
  });
  expect(mocks.record.mock.calls[0][0]).toMatchObject({
    archiveTranscript: true,
    transcript: [expect.objectContaining({ text: "hello how are you" })],
  });
});

it("stops a microphone acquired after the component unmounts", async () => {
  let grant!: (stream: object) => void;
  mocks.start.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
  );
  const { result, unmount } = renderHook(() => useLiveVoice());
  let started!: Promise<void>;
  await act(async () => {
    started = result.current.startMic();
    await Promise.resolve();
  });
  unmount();
  await act(async () => {
    grant({});
    await started;
  });
  expect(mocks.stop).toHaveBeenCalled();
  expect(mocks.transcribe).not.toHaveBeenCalled();
  expect(mocks.record).not.toHaveBeenCalled();
});

it("ending an already-paused session still saves it", async () => {
  const { result } = renderHook(() => useLiveVoice());
  await act(async () => {
    await result.current.startMic();
  });
  await act(async () => {
    await result.current.pauseMic();
  });
  expect(result.current.sessionActive).toBe(true);
  expect(mocks.record).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.endSession();
  });
  expect(result.current.saved).toBe(true);
  expect(mocks.record).toHaveBeenCalledTimes(1);
  await act(async () => {
    await result.current.startMic();
  });
  expect(result.current.sessionActive).toBe(true);
  expect(result.current.saved).toBe(false);
  await act(async () => {
    await result.current.endSession();
  });
  expect(mocks.record).toHaveBeenCalledTimes(2);
  expect(mocks.record.mock.calls[0][0].sessionId).not.toBe(
    mocks.record.mock.calls[1][0].sessionId,
  );
});
