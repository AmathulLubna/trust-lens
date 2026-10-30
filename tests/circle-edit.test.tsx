// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { Doc } from "../src/convex/_generated/dataModel";
import Circle from "../src/components/dashboard/Circle";

const mocks = vi.hoisted(() => ({ members: [] as unknown[], add: vi.fn(), update: vi.fn(), remove: vi.fn(), notify: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: () => mocks.members,
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name === "circle:update") return mocks.update;
    if (name === "circle:remove") return mocks.remove;
    if (name === "circle:setNotify") return mocks.notify;
    return mocks.add;
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const member = { _id: "member-1", _creationTime: 1, userId: "user-1", addedAt: 1, name: "Rohan", phone: "+91 90000 00000", email: "rohan@example.com", relation: "Brother", notifyOnFlag: true } as Doc<"trustedCircle">;
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  mocks.members = [{ ...member }];
  mocks.update.mockResolvedValue(member._id);
  mocks.add.mockResolvedValue("member-2");
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe("circle member editing", () => {
  it("prefills details and saves changes on the existing member without adding a duplicate", async () => {
    const view = render(<Circle />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Rohan" }));
    const form = within(screen.getByRole("form", { name: "Edit circle member" }));
    expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("Rohan");
    expect((form.getByLabelText("Phone") as HTMLInputElement).value).toBe(member.phone);
    expect((form.getByLabelText(/Email/) as HTMLInputElement).value).toBe(member.email);
    expect((form.getByLabelText("Relation") as HTMLInputElement).value).toBe("Brother");
    fireEvent.change(form.getByLabelText("Name"), { target: { value: "Rohan Sharma" } });
    fireEvent.change(form.getByLabelText("Phone"), { target: { value: "+91 91111 11111" } });
    fireEvent.change(form.getByLabelText(/Email/), { target: { value: "new@example.com" } });
    fireEvent.change(form.getByLabelText("Relation"), { target: { value: "Family" } });
    fireEvent.click(form.getByRole("switch"));
    await act(async () => { fireEvent.click(form.getByRole("button", { name: "Save changes" })); });
    expect(mocks.update).toHaveBeenCalledWith({ memberId: member._id, name: "Rohan Sharma", phone: "+91 91111 11111", email: "new@example.com", relation: "Family", notifyOnFlag: false });
    expect(mocks.add).not.toHaveBeenCalled();
    expect(screen.queryByRole("form")).toBeNull();
    mocks.members = [{ ...member, name: "Rohan Sharma", email: "new@example.com", notifyOnFlag: false }];
    view.rerender(<Circle />);
    expect(screen.getByText("new@example.com")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Alert Rohan Sharma on flagged calls" }).getAttribute("aria-checked")).toBe("false");
  });

  it("cancels edits without changing the member and opens a clean add form afterwards", () => {
    render(<Circle />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Rohan" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unsaved change" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByText("Rohan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add a member" }));
    expect(screen.getByRole("form", { name: "Add circle member" })).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Register" })).toBeTruthy();
  });

  it("retains edited details and allows retry if saving fails", async () => {
    mocks.update.mockRejectedValueOnce(new Error("Network failure"));
    render(<Circle />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Rohan" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Changed name" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save changes" })); });
    expect(screen.getByRole("alert").textContent).toContain("Could not update member");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Changed name");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save changes" })); });
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.update.mock.calls[1][0]).toMatchObject({ memberId: member._id, name: "Changed name" });
  });
});
