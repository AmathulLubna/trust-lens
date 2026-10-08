import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import schema from "../src/convex/schema";
import { api } from "../src/convex/_generated/api";
const modules = import.meta.glob("../src/convex/**/*.{ts,js}");
it.skipIf(!process.env.TRUSTLENS_LOCAL_E2E)(
  "local generated speech: binary upload -> real Python detector/ASR -> persisted separated assessment -> deletion",
  async () => {
    vi.stubEnv("ACOUSTIC_SERVICE_URL", "http://127.0.0.1:8876");
    vi.stubEnv("ACOUSTIC_SERVICE_TOKEN", "regression-only-token");
    vi.stubEnv("ALERT_DELIVERY_ENABLED", "false");
    try {
      const t = convexTest(schema, modules);
      const userId = await t.run((ctx) =>
        ctx.db.insert("users", { name: "Test fixture" }),
      );
      const client = t.withIdentity({ subject: userId });
      const bytes = readFileSync(process.env.TRUSTLENS_GENERATED_WAV!);
      const response = await client.fetch("/audio/upload", {
        method: "POST",
        body: bytes,
        headers: {
          "X-Filename": "generated-speech.wav",
          "Content-Type": "audio/wav",
        },
      });
      expect(response.status).toBe(200);
      const { storageId } = await response.json();
      const analyzed = await client.action(api.acoustic.analyze, {
        storageId,
        eventId: "real-local-smoke",
        source: "upload",
        retainTranscript: false,
        language: "en",
      });
      expect(analyzed.result.acoustic.status).toBe("available");
      expect(analyzed.result.acoustic.score).not.toBeNull();
      expect(analyzed.result.contextStatus).toBe("available");
      expect(analyzed.result.transcript).toBeTruthy();
      const logs = await client.query(api.calls.list, {});
      expect(logs).toHaveLength(1);
      expect(JSON.parse(logs[0].assessmentJson!).transcript).toBeNull();
      expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
      console.log(
        "Synthetic fixture integration only:",
        JSON.stringify({
          acousticStatus: analyzed.result.acoustic.status,
          contextStatus: analyzed.result.contextStatus,
          durationSec: analyzed.result.reliability.durationSec,
          windows: analyzed.result.acoustic.windows,
          revision: analyzed.result.acoustic.revision,
          outcome: analyzed.result.outcome,
          cleanupPending: analyzed.cleanupPending,
        }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  },
  90000,
);
