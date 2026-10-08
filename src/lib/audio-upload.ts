import type { Id } from "../convex/_generated/dataModel";
import { MAX_AUDIO_BYTES } from "./assessment";

export async function uploadAudio(
  blob: Blob,
  filename: string,
  token: string | null | undefined,
  signal?: AbortSignal,
): Promise<Id<"_storage">> {
  if (!token) throw new Error("Sign in before uploading audio");
  if (!blob.size || blob.size > MAX_AUDIO_BYTES)
    throw new Error("Audio must be nonempty and at most 18 MiB");
  const site = import.meta.env.VITE_CONVEX_SITE_URL;
  if (!site)
    throw new Error("Set VITE_CONVEX_SITE_URL to the Convex HTTP endpoint");
  const response = await fetch(`${site.replace(/\/$/, "")}/audio/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": blob.type || "application/octet-stream",
      "X-Filename": encodeURIComponent(filename),
    },
    body: blob,
    signal: signal ?? AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Upload failed (${response.status})`);
  const data = (await response.json()) as { storageId?: string };
  if (!data.storageId)
    throw new Error("Upload did not return a storage identifier");
  return data.storageId as Id<"_storage">;
}
export function pcmWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (at: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) =>
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true),
  );
  return new Blob([buffer], { type: "audio/wav" });
}
