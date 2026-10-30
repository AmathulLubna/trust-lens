import { expect, it, vi } from "vitest";
import { ConvexVoiceClient } from "../frontend/client";
import type { VoiceJob } from "../../src/lib/local-voice";

it("sends audio through the Convex action without contacting loopback or asking for a key", async () => {
  const run = vi.fn().mockResolvedValue({ id: "job-1", status: "queued" });
  const client = new ConvexVoiceClient(run);
  await client.submit(new Blob(["audio"]), "v4", new AbortController().signal);
  expect(run).toHaveBeenCalledWith({ operation: "submit", model: "v4", audioBase64: "YXVkaW8=" });
  await client.job("job-1", new AbortController().signal);
  expect(run).toHaveBeenLastCalledWith({ operation: "job", id: "job-1" });
  await client.cancel("job-1");
  expect(run).toHaveBeenLastCalledWith({ operation: "cancel", id: "job-1" });
  await expect(client.pairing()).rejects.toThrow("Unsupported");
});

it("preserves an allocated job ID when cancellation happens during submission", async () => {
  const controller = new AbortController();
  const run = vi.fn().mockImplementation(async () => {
    controller.abort();
    return { id: "cancel-me", status: "queued" } as VoiceJob;
  });
  const client = new ConvexVoiceClient(run);
  expect((await client.submit(new Blob(["audio"]), "v5", controller.signal)).id).toBe("cancel-me");
  await expect(client.job("cancel-me", controller.signal)).rejects.toThrow();
  expect(run).toHaveBeenCalledTimes(1);
});
