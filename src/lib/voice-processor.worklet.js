/**
 * TrustLens — voice-metrics AudioWorklet processor.
 *
 * Runs on the browser's dedicated real-time audio rendering thread, not the
 * main JS thread. That matters for one reason: main-thread loops driven by
 * requestAnimationFrame (paused on a hidden tab) or setInterval (throttled
 * after a while in the background) both go quiet exactly when a "live call
 * guard" most needs to keep working — screen locked, user on another app,
 * scam call still going. Audio rendering is not throttled the same way, so
 * VAD + pitch/jitter/flatness estimation happens here continuously; the main
 * thread just receives a small metrics message a few times a second.
 *
 * Plain JS on purpose, not TypeScript: this file is loaded at runtime via
 * `audioWorklet.addModule(url)`, which fetches and executes it as-is — there
 * is no bundler transform step in that path (unlike a `new Worker(new
 * URL(...))` import, which Vite *does* special-case). Shipping raw .ts here
 * would hand the browser TypeScript syntax it can't parse.
 *
 * This intentionally duplicates a slimmed version of the autocorrelation /
 * octave-jump / jitter logic in voice-analysis.ts. Worklets run in an
 * isolated global scope with no window/document access, so sharing code
 * directly with the main-thread module isn't available without extra build
 * tooling — keep the two in sync if the detection heuristics change.
 */

const MIN_VOICED_RMS = 0.004;
// Bridges brief mid-sentence dips (plosive gaps, quick breaths) so voicing
// doesn't flap on/off within a single sentence and reset the jitter window.
const VOICED_HANGOVER_MS = 200;
const MIN_PITCH_HZ = 70;
const MAX_PITCH_HZ = 1000;
const MIN_CORR = 0.55;
const ANALYSIS_WINDOW = 2048; // samples per pitch estimate
const HISTORY_WINDOW_MS = 2000;
const POST_INTERVAL_MS = 50; // ~20 Hz metrics to the main thread

class VoiceMetricsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(ANALYSIS_WINDOW);
    this.ringPos = 0;
    this.filled = false;
    this.pitchHistory = [];
    this.lastRawPitches = [];
    this.lastVoicedAt = -Infinity;
    this.lastPostAt = -Infinity;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input || input.length === 0) return true;
    for (let i = 0; i < input.length; i++) {
      this.ring[this.ringPos] = input[i];
      this.ringPos = (this.ringPos + 1) % ANALYSIS_WINDOW;
      if (this.ringPos === 0) this.filled = true;
    }

    const nowMs = currentTime * 1000;
    if (nowMs - this.lastPostAt < POST_INTERVAL_MS) return true;
    this.lastPostAt = nowMs;
    if (!this.filled) return true;

    const buf = this.orderedBuffer();
    const rms = computeRms(buf);
    if (rms >= MIN_VOICED_RMS) this.lastVoicedAt = nowMs;
    const voiced = nowMs - this.lastVoicedAt < VOICED_HANGOVER_MS;

    if (!voiced) {
      this.pushPitch(nowMs, null);
      this.port.postMessage({
        t: nowMs,
        rms,
        voiced: false,
        pitchHz: null,
        jitterPct: 0,
        flatness: 0,
      });
      return true;
    }

    const minLag = Math.max(2, Math.floor(sampleRate / MAX_PITCH_HZ));
    const maxLag = Math.min(buf.length - 2, Math.ceil(sampleRate / MIN_PITCH_HZ));
    const rawPitch = autocorrelatePitch(buf, sampleRate, minLag, maxLag);
    const pitch = this.rejectOctaveJump(rawPitch);
    this.pushPitch(nowMs, pitch);

    const cutoff = nowMs - HISTORY_WINDOW_MS;
    const windowed = this.pitchHistory.filter((p) => p.t >= cutoff);
    const voicedPitches = windowed.map((p) => p.pitch).filter((p) => p !== null);
    const meanPitch = voicedPitches.length
      ? voicedPitches.reduce((a, b) => a + b, 0) / voicedPitches.length
      : 0;

    let jitterPct = 0;
    let flatness = 0;
    if (voicedPitches.length >= 4 && meanPitch > 40) {
      const periods = voicedPitches.map((p) => sampleRate / p);
      let sum = 0;
      let absDiff = 0;
      for (let i = 0; i < periods.length; i++) {
        sum += periods[i];
        if (i > 0) absDiff += Math.abs(periods[i] - periods[i - 1]);
      }
      const meanPeriod = sum / periods.length;
      jitterPct =
        meanPeriod > 0 ? (absDiff / (periods.length - 1) / meanPeriod) * 100 : 0;
      const mean = voicedPitches.reduce((a, b) => a + b, 0) / voicedPitches.length;
      const variance =
        voicedPitches.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
        voicedPitches.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
      flatness = Math.min(1, cv / 0.3);
    }

    this.port.postMessage({
      t: nowMs,
      rms,
      voiced: true,
      pitchHz: pitch ? Math.round(pitch) : null,
      jitterPct: Math.round(jitterPct * 10) / 10,
      flatness: Math.round(flatness * 100) / 100,
    });
    return true;
  }

  orderedBuffer() {
    if (this.ringPos === 0) return this.ring.slice();
    const out = new Float32Array(ANALYSIS_WINDOW);
    out.set(this.ring.subarray(this.ringPos));
    out.set(this.ring.subarray(0, this.ringPos), ANALYSIS_WINDOW - this.ringPos);
    return out;
  }

  pushPitch(t, pitch) {
    this.pitchHistory.push({ t, pitch });
    const cutoff = t - HISTORY_WINDOW_MS;
    while (this.pitchHistory.length && this.pitchHistory[0].t < cutoff) {
      this.pitchHistory.shift();
    }
  }

  /** Folds single-frame octave halving/doubling back to the expected range
   *  instead of letting it spike the jitter window — see voice-analysis.ts. */
  rejectOctaveJump(pitch) {
    if (pitch === null) return null;
    if (this.lastRawPitches.length < 2) {
      this.lastRawPitches.push(pitch);
      if (this.lastRawPitches.length > 3) this.lastRawPitches.shift();
      return pitch;
    }
    const sorted = [...this.lastRawPitches].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    let corrected = pitch;
    if (median > 0) {
      const ratio = pitch / median;
      if (ratio > 1.8 && ratio < 2.2) corrected = pitch / 2;
      else if (ratio > 0.45 && ratio < 0.55) corrected = pitch * 2;
    }
    this.lastRawPitches.push(corrected);
    if (this.lastRawPitches.length > 3) this.lastRawPitches.shift();
    return corrected;
  }
}

function computeRms(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function autocorrelatePitch(buf, sr, minLag, maxLag) {
  const n = buf.length;
  const energy = (lag) => {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += buf[i] * buf[i];
    return sum;
  };
  let bestLag = -1;
  let bestCorr = 0;
  const e0 = energy(0) || 1e-9;
  for (let lag = minLag; lag < maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < n - lag; i++) corr += buf[i] * buf[i + lag];
    corr = corr / Math.sqrt(e0 * (energy(lag) || 1e-9));
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestCorr < MIN_CORR) return null;
  if (bestLag > minLag && bestLag < maxLag - 1) {
    const c0 = corrAt(buf, bestLag - 1, e0);
    const c1 = bestCorr;
    const c2 = corrAt(buf, bestLag + 1, e0);
    const denom = c0 - 2 * c1 + c2;
    if (denom !== 0) bestLag = bestLag + (c0 - c2) / (2 * denom);
  }
  return sr / bestLag;
}

function corrAt(buf, lag, e0) {
  let c = 0;
  let e = 1e-9;
  for (let i = 0; i < buf.length - lag; i++) {
    c += buf[i] * buf[i + lag];
    e += buf[i] * buf[i];
  }
  return c / Math.sqrt(e0 * e);
}

registerProcessor("voice-metrics-processor", VoiceMetricsProcessor);
