// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import LiveGuard from "../src/components/dashboard/LiveGuard";

const mocks = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("convex/react", () => ({
  useMutation: () => mocks.record,
  useQuery: () => [],
  useAction: () => vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    span: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
    li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
  },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

it("retries a failed scenario archive with the same session and original call time", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.record
    .mockRejectedValueOnce(new Error("Temporary outage"))
    .mockResolvedValueOnce("record-id");
  render(<LiveGuard />);
  fireEvent.click(
    screen.getByRole("button", { name: "Simulate the incoming call" }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(13_000);
  });
  expect(mocks.record).toHaveBeenCalledTimes(1);
  const firstAttempt = mocks.record.mock.calls[0][0];
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(mocks.record).toHaveBeenCalledTimes(1);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Retry saving call" }));
  });
  expect(mocks.record).toHaveBeenCalledTimes(2);
  expect(mocks.record.mock.calls[1][0]).toEqual(firstAttempt);
  expect(
    screen.queryByRole("button", { name: "Retry saving call" }),
  ).toBeNull();
});
