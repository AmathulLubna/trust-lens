// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { LocalDashboard } from "../src/pages/Dashboard";
import Voice from "../src/pages/Voice";

afterEach(cleanup);

function openDashboard(path = "/dashboard?tab=upload") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocalDashboard />
    </MemoryRouter>,
  );
}

describe("Upload Check in the TrustLens dashboard", () => {
  it("opens a transcript-check deep link in the requested mode", () => {
    openDashboard("/dashboard?tab=upload&check=scam");
    expect(
      screen
        .getByRole("tab", { name: "Transcript & scam check" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen
        .getByRole("link", { name: "Open hosted TrustLens" })
        .getAttribute("href"),
    ).toContain("check=scam");
  });

  it("defaults to hosted transcript checks and retains all eight navigation options", () => {
    openDashboard();
    expect(screen.getByRole("heading", { name: "Upload Check" })).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: "Transcript & scam check" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.queryByRole("button", { name: "Connect local detector" }),
    ).toBeNull();
    for (const label of [
      "Overview",
      "Live Guard",
      "Upload Check",
      "Number Check",
      "Message Check",
      "Call Ledger",
      "Alert Circle",
      "Settings",
    ]) {
      expect(
        screen.getAllByRole("button", { name: label }).length,
      ).toBeGreaterThan(0);
    }
    expect(
      screen.queryByRole("button", { name: "Local Voice Check" }),
    ).toBeNull();
  });

  it("explains cloud-only transcript analysis without mounting authenticated hooks", async () => {
    openDashboard();
    fireEvent.mouseDown(
      screen.getByRole("tab", { name: "Transcript & scam check" }),
      { button: 0, ctrlKey: false },
    );
    expect(
      await screen.findByText(
        "Use your TrustLens account for transcript checks",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Open hosted TrustLens" })
        .getAttribute("href"),
    ).toContain("tab=upload");
  });

  it("keeps the local classifier available through an explicit deep link", () => {
    openDashboard("/dashboard?tab=upload&check=voice");
    expect(screen.getByRole("tab", { name: "Local voice model (optional)" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "Connect local detector" })).toBeTruthy();
  });

  it("navigates to other sections and returns to Upload Check without a cloud connection", () => {
    openDashboard();
    fireEvent.click(screen.getAllByRole("button", { name: "Call Ledger" })[0]);
    expect(screen.getByRole("heading", { name: "Call Ledger" })).toBeTruthy();
    expect(
      screen.getByText(/Call Ledger uses your TrustLens account/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Go to Upload Check" }));
    expect(screen.getByRole("heading", { name: "Upload Check" })).toBeTruthy();
  });

  it("redirects the voice bookmark into Live Guard", () => {
    render(
      <MemoryRouter initialEntries={["/voice"]}>
        <Routes>
          <Route path="/voice" element={<Voice />} />
          <Route path="/dashboard" element={<LocalDashboard />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Live Guard" })).toBeTruthy();
  });
});
