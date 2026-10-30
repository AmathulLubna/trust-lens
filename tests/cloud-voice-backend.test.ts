import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import axios from "axios";
import schema from "../src/convex/schema";
import { api } from "../src/convex/_generated/api";

const modules = import.meta.glob("../src/convex/**/*.{ts,js}");

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run(ctx => ctx.db.insert("users", { name: "Voice test" }));
  return { t, user: t.withIdentity({ subject: userId }) };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("hosted voice configuration", () => {
  it("retains call history and settings from previous versions", async () => {
    const { t, user } = await setup();
    const userId = await t.run(async ctx => (await ctx.db.query("users").first())!._id);
    await t.run(async ctx => {
      await ctx.db.insert("userSettings", {
        userId, autoNotifyCircle: false, bannerAlert: true, channelPhone: true,
        channelWhatsapp: true, fullscreenAlert: true, sensitivity: 2, vibrationAlert: true,
      });
      await ctx.db.insert("callLogs", {
        userId, channel: "whatsapp", startedAt: 1, verdict: "safe", riskScore: 10, flags: [],
      });
    });
    expect((await user.query(api.calls.list))[0].channel).toBe("whatsapp");
    await user.mutation(api.settings.update, { autoNotifyCircle: true });
    const settings = await t.run(ctx => ctx.db.query("userSettings").first());
    expect(settings).toMatchObject({ autoNotifyCircle: true, bannerAlert: true, sensitivity: 2 });
  });

  it("requires authentication for readiness and transcription", async () => {
    const { t } = await setup();
    await expect(t.action(api.analyze.voiceStatus, {})).rejects.toThrow("Not authenticated");
    await expect(t.action(api.analyze.groqTranscribe, { audioBase64: "audio" })).rejects.toThrow("Not authenticated");
  });

  it("reports missing configuration without exposing secrets", async () => {
    const { user } = await setup();
    vi.stubEnv("GROQ_API_KEY", "");
    expect(await user.action(api.analyze.voiceStatus, {})).toMatchObject({ ready: false, message: expect.stringContaining("Convex") });
    vi.stubEnv("GROQ_API_KEY", "secret-test-key");
    const status = await user.action(api.analyze.voiceStatus, {});
    expect(status.ready).toBe(true);
    expect(JSON.stringify(status)).not.toContain("secret-test-key");
  });

  it("transcribes recorded audio using hosted Whisper with its actual format", async () => {
    const { user } = await setup();
    vi.stubEnv("GROQ_API_KEY", "secret-test-key");
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { text: "Hello, how are you?" } });
    const result = await user.action(api.analyze.groqTranscribe, {
      audioBase64: Buffer.from("test audio ".repeat(10)).toString("base64"),
      mimeType: "audio/mp4",
      filename: "segment.m4a",
      language: "hi",
    });
    expect(result).toEqual({ ok: true, text: "Hello, how are you?" });
    expect(post.mock.calls[0][0]).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    const form = post.mock.calls[0][1] as FormData;
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("language")).toBe("hi");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.get("temperature")).toBe("0");
    expect((form.get("file") as File).name).toBe("segment.m4a");
  });

  it("returns a recoverable provider failure", async () => {
    const { user } = await setup();
    vi.stubEnv("GROQ_API_KEY", "secret-test-key");
    vi.spyOn(axios, "post").mockRejectedValue(new Error("HTTP 429"));
    expect(await user.action(api.analyze.groqTranscribe, {
      audioBase64: Buffer.from("test audio ".repeat(10)).toString("base64"),
    })).toMatchObject({ ok: false, message: expect.stringContaining("429") });
  });

  it("drops silent hallucinations but preserves genuinely spoken thank you", async () => {
    const { user } = await setup();
    vi.stubEnv("GROQ_API_KEY", "test-key");
    const post = vi.spyOn(axios, "post");
    const args = { audioBase64: Buffer.from("audio ".repeat(20)).toString("base64") };
    post.mockResolvedValueOnce({ data: { text: "Thank you.", segments: [
      { text: "Thank you.", no_speech_prob: 0.95, avg_logprob: -0.2 },
    ] } });
    expect(await user.action(api.analyze.groqTranscribe, args)).toEqual({ ok: false, message: "No speech detected." });
    post.mockResolvedValueOnce({ data: { text: "Thank you.", segments: [
      { text: "Thank you.", no_speech_prob: 0.01, avg_logprob: -0.1, compression_ratio: 1.1 },
    ] } });
    expect(await user.action(api.analyze.groqTranscribe, args)).toEqual({ ok: true, text: "Thank you." });
  });

  it("filters unreliable segments without discarding the clear speech beside them", async () => {
    const { user } = await setup();
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.spyOn(axios, "post").mockResolvedValue({ data: { segments: [
      { text: "Send the code.", avg_logprob: -0.1, no_speech_prob: 0.01 },
      { text: "Invented phrase", avg_logprob: -1.8 },
      { text: "Repeated noise", compression_ratio: 3.5 },
      { text: "Please.", avg_logprob: -0.2, no_speech_prob: 0.02 },
    ] } });
    expect(await user.action(api.analyze.groqTranscribe, {
      audioBase64: Buffer.from("audio ".repeat(20)).toString("base64"),
    })).toEqual({ ok: true, text: "Send the code. Please." });
  });
});
