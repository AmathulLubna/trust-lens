// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLocalLiveVoice } from "../src/hooks/use-local-live-voice";
import { LocalVoiceClient, type VoiceJob } from "../src/lib/local-voice";

const mocks = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), analyze: vi.fn() }));
vi.mock("../src/lib/voice-analysis", () => ({ VoiceAnalyzer: class {
  start = mocks.start;
  stop = mocks.stop;
  analyze = mocks.analyze;
} }));

class Recorder {
  static isTypeSupported() { return true; }
  state = "inactive";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    void Promise.resolve().then(() => {
      this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) });
      this.onstop?.();
    });
  }
}
const done: VoiceJob = {
  id: "local-1", status: "done", completed: 1, total: 1, elapsed: 2,
  result: { model: "v4", score: 0.8, threshold: 0.51, vote: "AI-like", assessment: "Inconclusive", seconds: 6, windows: 1, cached: false, note: "Experimental" },
};
let client: LocalVoiceClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn() } });
  mocks.start.mockResolvedValue({});
  mocks.analyze.mockReturnValue({ voiced: true, rms: 0.1, pitchHz: 200 });
  client = new LocalVoiceClient("test-key");
  vi.spyOn(client, "submit").mockResolvedValue(done);
  vi.spyOn(client, "job").mockResolvedValue(done);
  vi.spyOn(client, "cancel").mockResolvedValue({ ...done, status: "cancelled" });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetAllMocks(); });

it("automatically checks live speech with the selected local model and preserves the last result after stop", async () => {
  const { result } = renderHook(() => useLocalLiveVoice(() => client, "v5"));
  await act(async () => { await result.current.start(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(client.submit).toHaveBeenCalledWith(expect.any(Blob), "v5", expect.any(AbortSignal));
  expect(result.current.job).toEqual(done);
  await act(async () => { result.current.stop(); });
  expect(result.current.active).toBe(false);
  expect(mocks.stop).toHaveBeenCalled();
  expect(result.current.job).toEqual(done);
  await act(async () => { await vi.advanceTimersByTimeAsync(12000); });
  expect(client.submit).toHaveBeenCalledTimes(1);
});

it("skips silence and resets the speech gate after a voiced sample", async () => {
  const { result } = renderHook(() => useLocalLiveVoice(() => client, "v4"));
  await act(async () => { await result.current.start(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  mocks.analyze.mockReturnValue({ voiced: false, rms: 0, pitchHz: null });
  await act(async () => { await vi.advanceTimersByTimeAsync(18000); });
  expect(client.submit).toHaveBeenCalledTimes(1);
});

it("bounds slow inference to one active job and the newest waiting sample", async () => {
  let release!: (job: VoiceJob) => void;
  vi.mocked(client.submit).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const { result } = renderHook(() => useLocalLiveVoice(() => client, "v4"));
  await act(async () => { await result.current.start(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(client.submit).toHaveBeenCalledTimes(1);
  await act(async () => { result.current.stop(); });
  expect(result.current.busy).toBe(true);
  await act(async () => { release(done); });
  expect(client.submit).toHaveBeenCalledTimes(2);
  expect(result.current.busy).toBe(false);
});

it("finishes the final partial speech chunk on stop and prevents a racing restart", async () => {
  const { result } = renderHook(() => useLocalLiveVoice(() => client, "v4"));
  await act(async () => { await result.current.start(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  await act(async () => { result.current.stop(); await result.current.start(); });
  expect(mocks.start).toHaveBeenCalledTimes(1);
  expect(client.submit).toHaveBeenCalledTimes(1);
  expect(result.current.job).toEqual(done);
});

it("cancels a job allocated after unmount and does not poll or show its result", async () => {
  let release!: (job: VoiceJob) => void;
  vi.mocked(client.submit).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const { result, unmount } = renderHook(() => useLocalLiveVoice(() => client, "v4"));
  await act(async () => { await result.current.start(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  unmount();
  await act(async () => { release({ ...done, status: "queued" }); });
  expect(client.cancel).toHaveBeenCalledWith("local-1");
  expect(client.job).not.toHaveBeenCalled();
  expect(mocks.stop).toHaveBeenCalled();
});

it("stops recording on service failure and can retry without cloud fallback", async () => {
  vi.mocked(client.submit).mockRejectedValueOnce(new Error("Local service offline"));
  const { result } = renderHook(() => useLocalLiveVoice(() => client, "v4"));
  await act(async () => { await result.current.start(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(result.current.active).toBe(false);
  expect(result.current.error).toContain("Local service offline");
  await act(async () => { await result.current.start(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(result.current.job).toEqual(done);
  expect(result.current.error).toBe("");
});

it("releases a microphone granted after stop", async () => {
  let grant!: (stream: object) => void;
  mocks.start.mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
  const { result } = renderHook(() => useLocalLiveVoice(() => client, "v4"));
  let started!: Promise<void>;
  act(() => { started = result.current.start(); });
  act(() => { result.current.stop(); });
  await act(async () => { grant({}); await started; });
  expect(mocks.stop).toHaveBeenCalled();
  expect(client.submit).not.toHaveBeenCalled();
  expect(result.current.active).toBe(false);
});
