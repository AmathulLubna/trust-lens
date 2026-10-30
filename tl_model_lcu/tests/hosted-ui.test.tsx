// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import HostedVoiceCheck from "../frontend/HostedVoiceCheck";

const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("convex/react", () => ({ useAction: () => run }));

beforeEach(() => {
  run.mockImplementation(async ({ operation }: { operation: string }) => operation === "health"
    ? { service: "trustlens-local-voice", state: "ready", models: ["v4", "v5"], error: null }
    : { connected: true });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("reuses the existing voice UI with no pairing field and accurate remote-audio disclosure", async () => {
  render(<HostedVoiceCheck embedded />);
  expect(screen.queryByLabelText("Pairing key from your laptop")).toBeNull();
  expect(screen.getByText(/Your audio is sent through TrustLens/)).toBeTruthy();
  fireEvent.click(screen.getByText("Connect detector"));
  await screen.findByText("Connected · shared detector ready");
  expect(run).toHaveBeenCalledWith({ operation: "health" });
  expect(run).toHaveBeenCalledWith({ operation: "session" });
  expect(screen.getByText(/up to 3 MiB/)).toBeTruthy();
});
