import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { api, internal } from "../src/convex/_generated/api";

const modules = import.meta.glob("../src/convex/**/*.{ts,js}");
const details = { name: "Rohan", phone: "+91 90000 00000", email: "rohan@example.com", relation: "Brother", notifyOnFlag: true };

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run(ctx => ctx.db.insert("users", { name: "Circle owner" }));
  const user = t.withIdentity({ subject: userId });
  const memberId = await user.mutation(api.circle.add, details);
  return { t, user, userId, memberId };
}

describe("editing circle members", () => {
  it("updates the existing record, trims fields and routes future alerts to the updated address", async () => {
    const { t, user, userId, memberId } = await setup();
    const original = await t.run(ctx => ctx.db.get(memberId));
    const edited = { name: " Rohan Sharma ", phone: " +91 91111 11111 ", email: " new@example.com ", relation: " Family ", notifyOnFlag: true };
    expect(await user.mutation(api.circle.update, { memberId, ...edited })).toBe(memberId);
    const members = await user.query(api.circle.list);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ _id: memberId, userId, addedAt: original!.addedAt, name: "Rohan Sharma", phone: "+91 91111 11111", email: "new@example.com", relation: "Family" });
    expect((await t.query(internal.circle.listForAlerts, { userId }))[0].email).toBe("new@example.com");
    expect(await t.run(ctx => ctx.db.query("circleAlerts").collect())).toEqual([]);
  });

  it("can clear optional email and disable alerts without leaving stale details", async () => {
    const { t, user, userId, memberId } = await setup();
    await user.mutation(api.circle.update, { memberId, ...details, email: "   ", notifyOnFlag: false });
    expect((await user.query(api.circle.list))[0]).toMatchObject({ _id: memberId, notifyOnFlag: false });
    expect((await user.query(api.circle.list))[0].email).toBeUndefined();
    expect(await t.query(internal.circle.listForAlerts, { userId })).toEqual([]);
  });

  it("rejects unauthenticated edits and edits to another user's circle", async () => {
    const { t, user, memberId } = await setup();
    const otherId = await t.run(ctx => ctx.db.insert("users", { name: "Other user" }));
    await expect(t.mutation(api.circle.update, { memberId, ...details, name: "Changed" })).rejects.toThrow("Not authenticated");
    await expect(t.withIdentity({ subject: otherId }).mutation(api.circle.update, { memberId, ...details, name: "Changed" })).rejects.toThrow("Not found");
    expect((await user.query(api.circle.list))[0].name).toBe("Rohan");
  });

  it("rejects blank required fields and invalid email without changing saved details", async () => {
    const { user, memberId } = await setup();
    for (const field of ["name", "phone", "relation"] as const) {
      await expect(user.mutation(api.circle.update, { memberId, ...details, [field]: " " })).rejects.toThrow("required");
    }
    await expect(user.mutation(api.circle.update, { memberId, ...details, email: "invalid-address" })).rejects.toThrow("valid email");
    expect((await user.query(api.circle.list))[0]).toMatchObject(details);
  });
});
