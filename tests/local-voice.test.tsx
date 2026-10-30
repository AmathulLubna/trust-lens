// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import LocalVoiceCheck from "../src/components/dashboard/LocalVoiceCheck";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("MediaRecorder", undefined);
  URL.createObjectURL = vi.fn(() => "blob:local-audio");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function connect() {
  fireEvent.change(screen.getByLabelText("Pairing key from your laptop"), {
    target: { value: "demo-key" },
  });
  fireEvent.click(screen.getByText("Connect local detector"));
  await screen.findByText("Connected · ready on your laptop");
}

describe("Local Voice Check", () => {
  it("cancels the server job after a polling failure without hiding the error", async () => {
    fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
      if (url.endsWith("/health"))
        return reply({
          service: "trustlens-local-voice",
          state: "ready",
          models: ["v4"],
        });
      if (url.endsWith("/session")) return reply({ paired: true });
      if (options.method === "POST")
        return reply({
          id: "orphan",
          status: "queued",
          completed: 0,
          total: 0,
        });
      if (options.method === "DELETE")
        return reply({ id: "orphan", status: "cancelling" });
      return reply({ detail: "Polling failed" }, 503);
    });
    render(<LocalVoiceCheck />);
    await connect();
    fireEvent.change(screen.getByLabelText("Choose audio file"), {
      target: { files: [new File(["audio"], "test.mp3")] },
    });
    fireEvent.click(screen.getByText("Analyze recording"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Polling failed",
    );
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          url.endsWith("/orphan") && options.method === "DELETE",
      ),
    ).toBe(true);
  });

  it("releases the microphone when the browser cannot start recording", async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] };
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    vi.stubGlobal(
      "MediaRecorder",
      class {
        state = "inactive";
        stream = stream;
        start() {
          throw new Error("Recording device unavailable");
        }
      },
    );
    render(<LocalVoiceCheck />);
    fireEvent.click(screen.getByText("Record microphone"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Recording device unavailable",
    );
    expect(stop).toHaveBeenCalled();
    expect(screen.getByText("Record microphone")).toBeTruthy();
  });

  it("shows the service startup instructions on connection failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<LocalVoiceCheck />);
    fireEvent.change(screen.getByLabelText("Pairing key from your laptop"), {
      target: { value: "demo-key" },
    });
    fireEvent.click(screen.getByText("Connect local detector"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Start-VoiceSentinel.cmd",
    );
  });

  it("sends the actual file to loopback with a pairing key and keeps the result inconclusive", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/health"))
        return reply({
          service: "trustlens-local-voice",
          state: "ready",
          models: ["v4", "v5"],
        });
      if (url.endsWith("/session")) return reply({ paired: true });
      return reply({
        id: "one",
        status: "done",
        elapsed: 1.5,
        result: {
          model: "v4",
          score: 0.2,
          threshold: 0.5188,
          vote: "human-like",
          assessment: "Inconclusive",
          seconds: 6,
          windows: 1,
          cached: false,
          note: "Experimental model output.",
        },
      });
    });
    render(<LocalVoiceCheck />);
    await connect();
    const file = new File(["audio"], "genuine.mp3", { type: "audio/mpeg" });
    fireEvent.change(screen.getByLabelText("Choose audio file"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByText("Analyze recording"));
    await screen.findByText("Assessment: Inconclusive");
    expect(screen.getByText("human-like")).toBeTruthy();
    const call = fetchMock.mock.calls.find(([url]) => url.includes("/jobs?"));
    expect(call?.[0]).toBe("http://127.0.0.1:8765/api/voice/jobs?model=v4");
    expect(call?.[1].body).toBe(file);
    expect(call?.[1].headers["X-TrustLens-Key"]).toBe("demo-key");
    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "v5" },
    });
    expect(screen.queryByText("human-like")).toBeNull();
  });

  it("cancels a submitted job and suppresses stale results", async () => {
    fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
      if (url.endsWith("/health"))
        return reply({
          service: "trustlens-local-voice",
          state: "ready",
          models: ["v4"],
        });
      if (url.endsWith("/session")) return reply({ paired: true });
      return reply({
        id: "pending",
        status: options.method === "DELETE" ? "cancelling" : "queued",
        completed: 0,
        total: 0,
      });
    });
    render(<LocalVoiceCheck />);
    await connect();
    fireEvent.change(screen.getByLabelText("Choose audio file"), {
      target: { files: [new File(["audio"], "test.mp3")] },
    });
    fireEvent.click(screen.getByText("Analyze recording"));
    await screen.findByText(
      "Preparing audio and waiting for the local detector…",
    );
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, options]) =>
            url.endsWith("/pending") && options.method === "DELETE",
        ),
      ).toBe(true),
    );
    expect(screen.queryByText("Assessment: Inconclusive")).toBeNull();
  });
});
