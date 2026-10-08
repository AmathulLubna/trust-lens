import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
interface CaptureFixture {
  process(inputs: Float32Array[][]): boolean;
  port: { onmessage: (event: { data: string }) => void };
}
function fixture() {
  let now = 0;
  let Constructor!: new () => CaptureFixture;
  const messages: Array<Record<string, unknown>> = [];
  class Processor {
    port = {
      postMessage: (message: Record<string, unknown>) => messages.push(message),
      onmessage: () => {},
    };
  }
  runInNewContext(
    readFileSync(
      new URL("../src/lib/capture.worklet.js", import.meta.url),
      "utf8",
    ),
    {
      AudioWorkletProcessor: Processor,
      sampleRate: 100,
      Float32Array,
      Date: { now: () => now },
      registerProcessor: (_name: string, value: typeof Constructor) => {
        Constructor = value;
      },
    },
  );
  const processor = new Constructor();
  return {
    processor,
    messages,
    tick() {
      now += 100;
      processor.process([[new Float32Array(10)]]);
    },
  };
}
it("bounds worklet-to-page audio transfers and coalesces dropped coverage", () => {
  const f = fixture();
  for (let i = 0; i < 240; i++) f.tick();
  expect(f.messages.filter((m) => m.samples)).toHaveLength(1);
  f.processor.port.onmessage({ data: "ack" });
  for (let i = 0; i < 60; i++) f.tick();
  expect(f.messages.filter((m) => m.samples)).toHaveLength(2);
  const gaps = f.messages.filter((m) => m.gap);
  expect(gaps).toHaveLength(1);
  expect((gaps[0].gap as { durationSec: number }).durationSec).toBe(18);
  expect(f.messages.filter((m) => m.samples)[1].captureStartedMs).toBe(24100);
});
it("flushes the final partial buffer before acknowledging finalization", () => {
  const f = fixture();
  for (let i = 0; i < 15; i++) f.tick();
  f.processor.port.onmessage({ data: "flush" });
  expect(f.messages[0].durationSec).toBe(1.5);
  expect(f.messages[1]).toEqual({ flushed: true });
});

it("labels steady pitch as flatter without claiming acoustic authenticity", () => {
  interface Diagnostics {
    filled: boolean;
    pitchHistory: Array<{ t: number; pitch: number }>;
    orderedBuffer: () => Float32Array;
    rejectOctaveJump: () => number;
    process: (inputs: Float32Array[][]) => boolean;
  }
  function measure(pitches: number[]) {
    let Constructor!: new () => Diagnostics;
    let metric!: Record<string, unknown>;
    class Processor {
      port = {
        postMessage: (m: Record<string, unknown>) => {
          metric = m;
        },
      };
    }
    runInNewContext(
      readFileSync(
        new URL("../src/lib/voice-processor.worklet.js", import.meta.url),
        "utf8",
      ),
      {
        AudioWorkletProcessor: Processor,
        sampleRate: 16000,
        currentTime: 1,
        Float32Array,
        registerProcessor: (_name: string, value: typeof Constructor) =>
          (Constructor = value),
      },
    );
    const processor = new Constructor();
    processor.filled = true;
    processor.pitchHistory = pitches.map((pitch) => ({ t: 1000, pitch }));
    processor.rejectOctaveJump = () => 200;
    processor.orderedBuffer = () =>
      Float32Array.from(
        { length: 2048 },
        (_, i) => 0.1 * Math.sin((2 * Math.PI * 200 * i) / 16000),
      );
    processor.process([[new Float32Array(128)]]);
    return metric;
  }
  const steady = measure([200, 200, 200, 200, 200, 200]),
    varying = measure([120, 180, 240, 300, 150, 270]);
  expect(steady.flatness).toBeGreaterThan(varying.flatness as number);
  expect(steady.confidence).toBeUndefined();
});
