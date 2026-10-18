import { expect, it } from "vitest";
import { SerialQueue } from "../src/lib/serial-queue";

it("preserves slow segments in order and drains the final segment", async () => {
  const queue = new SerialQueue();
  const completed: number[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = queue.enqueue(async () => {
    await gate;
    completed.push(1);
  });
  const second = queue.enqueue(async () => {
    completed.push(2);
  });
  const final = queue.enqueue(async () => {
    completed.push(3);
  });
  await Promise.resolve();
  expect(completed).toEqual([]);
  release();
  await queue.drain();
  await Promise.all([first, second, final]);
  expect(completed).toEqual([1, 2, 3]);
});

it("continues after a failed segment and exposes overload instead of silently discarding it", async () => {
  const queue = new SerialQueue(1);
  const failure = queue.enqueue(async () => {
    throw new Error("bad segment");
  });
  await expect(queue.enqueue(async () => {})).rejects.toThrow("falling behind");
  await expect(failure).rejects.toThrow("bad segment");
  await queue.drain();
  let ran = false;
  await queue.enqueue(async () => {
    ran = true;
  });
  expect(ran).toBe(true);
});
