import type { VoiceMetrics } from "./voice-analysis";

/** One gate per recording chunk, sampled every 100 ms. Never reuse evidence
 * from an earlier chunk: a voiced sentence must not admit the silence after it. */
export class SpeechGate {
  private voicedSamples = 0;

  observe(metrics: VoiceMetrics) {
    // Require current energy and pitch too, so the analyzer's hangover alone
    // cannot turn silence (or a single click) into a speech segment.
    if (metrics.voiced && metrics.rms >= 0.004 && metrics.pitchHz !== null)
      this.voicedSamples += 1;
  }

  get hasSpeech() {
    return this.voicedSamples >= 3;
  }
}
