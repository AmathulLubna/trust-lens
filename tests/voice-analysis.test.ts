import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { VoiceAnalyzer } from "../src/lib/voice-analysis";

afterEach(() => vi.restoreAllMocks());

function mainThreadFlatness(varyPitch: boolean) {
  let time = 0;
  vi.spyOn(performance, "now").mockImplementation(() => time);
  const analyzer = new VoiceAnalyzer();
  // Supply a deterministic audio graph without opening a real microphone.
  Object.assign(analyzer, {
    ctx: {},
    sampleRate: 48000,
    analyser: {
      getFloatTimeDomainData(buffer: Float32Array) {
        const frequency = varyPitch ? 200 + 75 * Math.sin(time / 400) : 200;
        buffer.forEach((_, i) => {
          buffer[i] = 0.2 * Math.sin((2 * Math.PI * frequency * i) / 48000);
        });
      },
      getFloatFrequencyData(buffer: Float32Array) {
        buffer.fill(-60);
      },
    },
  });
  let result = analyzer.analyze();
  for (let i = 0; i < 45; i++) {
    time += 50;
    result = analyzer.analyze();
  }
  return result;
}

it("scores a steady pitch as flatter than a changing pitch in the fallback engine", () => {
  const steady = mainThreadFlatness(false);
  const varying = mainThreadFlatness(true);
  expect(steady.flatness).toBeGreaterThan(0.95);
  expect(varying.flatness).toBeLessThan(0.5);
  expect(steady.confidence).toBeGreaterThan(varying.confidence);
});

function workletFlatness(varyPitch: boolean) {
  let Processor!: new () => { process: (inputs: Float32Array[][]) => boolean };
  let metrics: { flatness: number } = { flatness: 0 };
  const context = {
    currentTime: 0,
    sampleRate: 48000,
    AudioWorkletProcessor: class {
      port = {
        postMessage: (value: typeof metrics) => {
          metrics = value;
        },
      };
    },
    registerProcessor: (_name: string, ctor: typeof Processor) => {
      Processor = ctor;
    },
  };
  runInNewContext(
    readFileSync(
      new URL("../src/lib/voice-processor.worklet.js", import.meta.url),
      "utf8",
    ),
    context,
  );
  const processor = new Processor();
  let phase = 0;
  for (let block = 0; block < 900; block++) {
    context.currentTime = (block * 128) / 48000;
    const input = Float32Array.from({ length: 128 }, (_, i) => {
      const t = context.currentTime + i / 48000;
      const frequency = varyPitch ? 200 + 75 * Math.sin(t / 0.4) : 200;
      phase += (2 * Math.PI * frequency) / 48000;
      return 0.2 * Math.sin(phase);
    });
    processor.process([[input]]);
  }
  return metrics.flatness;
}

it("uses the same flatness direction in the real AudioWorklet processor", () => {
  expect(workletFlatness(false)).toBeGreaterThan(0.95);
  expect(workletFlatness(true)).toBeLessThan(0.5);
});
