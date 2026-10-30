// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LocalVoiceLedgerActions from "../src/components/dashboard/LocalVoiceLedgerActions";
import type { VoiceResult } from "../src/lib/local-voice";

const mocks = vi.hoisted(() => ({
  status: { saved: false, alertStatus: "not_requested" },
  record: vi.fn(),
}));
vi.mock("convex/react", () => ({ useQuery: () => mocks.status, useMutation: () => mocks.record }));
const result: VoiceResult = { model: "v4", score: 0.8, threshold: 0.51881, seconds: 20.45, windows: 4, vote: "AI-like", assessment: "Inconclusive", cached: false, note: "Experimental" };
beforeEach(() => { mocks.status = { saved: false, alertStatus: "not_requested" }; mocks.record.mockResolvedValue("id"); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("local voice result actions", () => {
  it("offers ledger-only saving for a human-like result and sends no request before a click", async () => {
    render(<LocalVoiceLedgerActions result={{ ...result, score: 0.01164, vote: "human-like" }} />);
    expect(mocks.record).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /alert circle/i })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add to ledger" })); });
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ alertCircle: false, result: expect.objectContaining({ score: 0.01164 }) }));
    expect(Object.keys(mocks.record.mock.calls[0][0])).toEqual(["sessionId", "alertCircle", "result"]);
  });

  it("offers separate silent and alert choices for AI-like results and uses the same result when alerting after a save", async () => {
    const view = render(<LocalVoiceLedgerActions result={result} checkTimeSec={11.67} />);
    expect(screen.getByRole("button", { name: "Add to ledger & alert circle" })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add to ledger" })); });
    const sessionId = mocks.record.mock.calls[0][0].sessionId;
    mocks.status = { saved: true, alertStatus: "not_requested" };
    view.rerender(<LocalVoiceLedgerActions result={result} checkTimeSec={11.67} />);
    expect((screen.getByRole("button", { name: "Added to ledger" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Alert circle for this result" })); });
    expect(mocks.record.mock.calls[1][0]).toMatchObject({ sessionId, alertCircle: true, result: { checkTimeSec: 11.67 } });
  });

  it("shows missing email configuration without claiming delivery", () => {
    mocks.status = { saved: true, alertStatus: "not_configured" };
    render(<LocalVoiceLedgerActions result={result} />);
    expect(screen.getByRole("status").textContent).toContain("No circle alert was sent");
    expect(screen.queryByRole("button", { name: "Circle alert sent" })).toBeNull();
    expect((screen.getByRole("button", { name: "Alert circle for this result" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("distinguishes queued alerts from accepted email delivery", () => {
    mocks.status = { saved: true, alertStatus: "queued" };
    const view = render(<LocalVoiceLedgerActions result={result} />);
    expect((screen.getByRole("button", { name: "Circle alert queued…" }) as HTMLButtonElement).disabled).toBe(true);
    mocks.status = { saved: true, alertStatus: "sent" };
    view.rerender(<LocalVoiceLedgerActions result={result} />);
    expect(screen.getByRole("status").textContent).toContain("accepted for at least one");
  });

  it("allows a failed save to be retried with the same session", async () => {
    mocks.record.mockRejectedValueOnce(new Error("Network failure"));
    render(<LocalVoiceLedgerActions result={result} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add to ledger" })); });
    expect(screen.getByRole("alert").textContent).toContain("Try again");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Add to ledger" })); });
    expect(mocks.record.mock.calls[0][0].sessionId).toBe(mocks.record.mock.calls[1][0].sessionId);
  });
});
