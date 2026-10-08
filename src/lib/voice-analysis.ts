/** Deprecated browser diagnostics. Not used for production detection.
 * Pitch-period changes are frame estimates, not clinical cycle jitter.
 * flatness = 1 - min(1, pitch coefficient of variation / 0.3).
 * Acoustic authenticity is supplied only by the Python checkpoint.
 */

export interface VoiceMetrics {
  voiced: boolean;
  rms: number; // 0..1 loudness
  pitchHz: number | null;
  jitterPct: number;
  flatness: number; // 0..1 — higher = flatter prosody
  rolloff: number; // 0..1 — higher = duller / band-limited
  confidence: null; // retired: no browser authenticity estimate
}

const FFT_SIZE = 2048;
// Lowered from 0.008 so quieter audio picked up off a phone speaker
// (held near the mic, not spoken directly into it) still counts as voiced.
const MIN_VOICED_RMS = 0.004;
const MIN_CORR = 0.55;
// Pitch search range expressed in Hz (not samples) so it stays correct
// across devices reporting 44.1k, 48k, etc. — converted to a lag range
// against the *actual* AudioContext sample rate at analyse time.
const MIN_PITCH_HZ = 70;
const MAX_PITCH_HZ = 1000;
// Rolling window expressed in wall-clock time, not frame count. The old
// frame-count buffer silently shrank from ~1s of real audio to a few tens
// of ms whenever rAF throttled under load — exactly when a distorted
// jitter/flatness read is most likely and least wanted.
const HISTORY_WINDOW_MS = 2000;
// Bridges brief mid-sentence dips (plosives, quick breaths) so voicing
// doesn't flap on/off within a sentence and reset the jitter window —
// mirrors the same constant in voice-processor.worklet.ts.
const VOICED_HANGOVER_MS = 200;

interface WorkletMetrics {
  t: number;
  rms: number;
  voiced: boolean;
  pitchHz: number | null;
  jitterPct: number;
  flatness: number;
}

export class VoiceAnalyzer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private latestFromWorklet: WorkletMetrics | null = null;
  private stream: MediaStream | null = null;
  private time: Float32Array<ArrayBuffer>;
  private freq: Float32Array<ArrayBuffer>;
  private pitchHistory: { t: number; pitch: number | null }[] = [];
  private lastRawPitches: number[] = []; // last 3 raw pitches, for octave-jump rejection

  private lastVoicedAt = -Infinity;
  private sampleRate = 44100;

  constructor() {
    this.time = new Float32Array(FFT_SIZE);
    this.freq = new Float32Array(FFT_SIZE / 2);
  }

  /** Starts the microphone and returns the live MediaStream so callers can
   *  share it (e.g. with a MediaRecorder for transcription chunks). */
  async start(): Promise<MediaStream> {
    if (this.ctx) {
      if (this.stream) return this.stream;
      throw new Error("Analyzer already initialised without a stream");
    }
    // For the "live call on speaker" demo, the mic is picking up a phone
    // speaker from a few inches/feet away — much quieter and noisier than
    // talking straight into the mic. autoGainControl boosts that quiet,
    // distant signal so both the acoustic analyser and Whisper actually
    // get usable audio instead of near-silence. echoCancellation /
    // noiseSuppression stay off since they can smear the exact pitch-jitter
    // and prosody cues the synthetic-voice classifier relies on.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
    });
    this.attach(stream);
    return stream;
  }

  /** Build the analyser graph from an already-obtained stream. */
  attach(stream: MediaStream): void {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.4;
    src.connect(analyser);
    void ctx.resume();
    this.ctx = ctx;
    this.analyser = analyser;
    this.stream = stream;
    this.sampleRate = ctx.sampleRate;

    // Offload VAD + pitch/jitter/flatness to the AudioWorklet so it keeps
    // running on the real-time audio thread even when the tab is fully
    // backgrounded — analyze() below transparently falls back to the old
    // main-thread computation until (or unless) this resolves, e.g. on
    // browsers without AudioWorklet support or if module loading is blocked.
    void this.initWorklet(ctx, src);
  }

  private async initWorklet(
    ctx: AudioContext,
    src: MediaStreamAudioSourceNode,
  ): Promise<void> {
    try {
      if (!ctx.audioWorklet) return;
      const url = new URL("./voice-processor.worklet.js", import.meta.url);
      await ctx.audioWorklet.addModule(url.href);
      const node = new AudioWorkletNode(ctx, "voice-metrics-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });
      node.port.onmessage = (e: MessageEvent<WorkletMetrics>) => {
        this.latestFromWorklet = e.data;
      };
      // The worklet has to be part of a pulled audio graph to keep running;
      // route it to a silent gain node so nothing is audibly played back
      // (no mic feedback loop) while the graph still gets pulled.
      const silence = ctx.createGain();
      silence.gain.value = 0;
      src.connect(node);
      node.connect(silence);
      silence.connect(ctx.destination);
      this.workletNode = node;
    } catch {
      // AudioWorklet unavailable or blocked (older Safari, restrictive CSP,
      // etc.) — analyze() keeps using the main-thread fallback path below.
      this.workletNode = null;
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.analyser = null;
    }
    this.pitchHistory = [];
    this.lastRawPitches = [];

    this.latestFromWorklet = null;
    this.lastVoicedAt = -Infinity;
  }

  /** One snapshot of the live audio. Call ~10–30×/s. */
  analyze(): VoiceMetrics {
    const analyser = this.analyser;
    if (!analyser || !this.ctx) {
      return emptyMetrics();
    }
    if (this.workletNode) {
      return this.analyzeFromWorklet(analyser);
    }
    return this.analyzeOnMainThread(analyser);
  }

  /** Preferred path: read the metrics the worklet already computed on the
   *  audio thread, and only pull the (main-thread-only) FFT snapshot for
   *  spectral rolloff, which is cheap on its own. */
  private analyzeFromWorklet(analyser: AnalyserNode): VoiceMetrics {
    const m = this.latestFromWorklet;
    if (!m) return emptyMetrics(); // worklet ready but hasn't posted yet

    analyser.getFloatFrequencyData(this.freq);
    const rolloff = m.voiced ? spectralRolloff(this.freq, this.sampleRate) : 0;
    const confidence = null;

    return {
      voiced: m.voiced,
      rms: m.rms,
      pitchHz: m.pitchHz,
      jitterPct: m.jitterPct,
      flatness: m.flatness,
      rolloff: round2(rolloff),
      confidence,
    };
  }

  /** Fallback path used until the worklet is ready (or on browsers without
   *  AudioWorklet support): identical heuristics, computed per-call on the
   *  main thread. */
  private analyzeOnMainThread(analyser: AnalyserNode): VoiceMetrics {
    const now = performance.now();
    analyser.getFloatTimeDomainData(this.time);
    const rms = computeRms(this.time);
    if (rms >= MIN_VOICED_RMS) this.lastVoicedAt = now;
    const voiced = now - this.lastVoicedAt < VOICED_HANGOVER_MS;

    if (!voiced) {
      this.pushPitch(now, null);
      return {
        voiced: false,
        rms,
        pitchHz: null,
        jitterPct: 0,
        flatness: 0,
        rolloff: 0,
        confidence: null,
      };
    }

    const minLag = Math.max(2, Math.floor(this.sampleRate / MAX_PITCH_HZ));
    const maxLag = Math.min(
      this.time.length - 2,
      Math.ceil(this.sampleRate / MIN_PITCH_HZ),
    );
    const rawPitch = autocorrelatePitch(
      this.time,
      this.sampleRate,
      minLag,
      maxLag,
    );
    // Reject single-frame octave jumps (halving/doubling) that are common
    // artifacts of autocorrelation on noisy or speaker-relayed audio: if
    // this pitch is >45% away from the last two accepted pitches but a
    // harmonic of one of them is close, keep the previous trend instead of
    // letting one bad frame corrupt the jitter window.
    const pitch = this.rejectOctaveJump(rawPitch);
    this.pushPitch(now, pitch);

    const cutoff = now - HISTORY_WINDOW_MS;
    const windowed = this.pitchHistory.filter((p) => p.t >= cutoff);
    const voicedPitches = windowed
      .map((p) => p.pitch)
      .filter((p): p is number => p !== null);
    const meanPitch =
      voicedPitches.length > 0
        ? voicedPitches.reduce((a, b) => a + b, 0) / voicedPitches.length
        : 0;

    // Jitter: mean absolute deviation between consecutive periods / mean period.
    let jitterPct = 0;
    let flatness = 0;
    if (voicedPitches.length >= 4 && meanPitch > 40) {
      const periods = voicedPitches.map((p) => this.sampleRate / p);
      let sum = 0;
      let absDiff = 0;
      for (let i = 0; i < periods.length; i++) {
        sum += periods[i];
        if (i > 0) absDiff += Math.abs(periods[i] - periods[i - 1]);
      }
      const meanPeriod = sum / periods.length;
      jitterPct =
        meanPeriod > 0
          ? (absDiff / (periods.length - 1) / meanPeriod) * 100
          : 0;
      // Prosody flatness = one minus normalized pitch coefficient of variation.
      const mean =
        voicedPitches.reduce((a, b) => a + b, 0) / voicedPitches.length;
      const variance =
        voicedPitches.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
        voicedPitches.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
      flatness = 1 - Math.min(1, cv / 0.3);
    }

    analyser.getFloatFrequencyData(this.freq);
    const rolloff = spectralRolloff(this.freq, this.sampleRate);
    const confidence = null;

    return {
      voiced: true,
      rms,
      pitchHz: pitch ? Math.round(pitch) : null,
      jitterPct: round1(jitterPct),
      flatness: round2(flatness),
      rolloff: round2(rolloff),
      confidence,
    };
  }

  private pushPitch(t: number, pitch: number | null): void {
    this.pitchHistory.push({ t, pitch });
    const cutoff = t - HISTORY_WINDOW_MS;
    while (this.pitchHistory.length && this.pitchHistory[0].t < cutoff) {
      this.pitchHistory.shift();
    }
  }

  /** Guards against autocorrelation locking onto a harmonic (half or double
   *  the true pitch) for a single frame — common on noisy/speaker-relayed
   *  audio. Compares the new pitch to the median of the last few accepted
   *  pitches; if it's a near-exact octave multiple of that median, folds it
   *  back to the expected octave instead of letting it spike the jitter calc. */
  private rejectOctaveJump(pitch: number | null): number | null {
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

function emptyMetrics(): VoiceMetrics {
  return {
    voiced: false,
    rms: 0,
    pitchHz: null,
    jitterPct: 0,
    flatness: 0,
    rolloff: 0,
    confidence: null,
  };
}

function computeRms(buf: Float32Array<ArrayBuffer>): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

/** Autocorrelation pitch detection with parabolic interpolation. */
function autocorrelatePitch(
  buf: Float32Array<ArrayBuffer>,
  sampleRate: number,
  minLag: number,
  maxLag: number,
): number | null {
  const n = buf.length;
  const energy = (lag: number) => {
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

  // Parabolic interpolation around the peak.
  if (bestLag > minLag && bestLag < maxLag - 1) {
    const c0 = corrAt(buf, bestLag - 1, e0);
    const c1 = bestCorr;
    const c2 = corrAt(buf, bestLag + 1, e0);
    const denom = c0 - 2 * c1 + c2;
    if (denom !== 0) {
      const delta = (c0 - c2) / (2 * denom);
      bestLag = bestLag + delta;
    }
  }
  return sampleRate / bestLag;
}

function corrAt(
  buf: Float32Array<ArrayBuffer>,
  lag: number,
  e0: number,
): number {
  let c = 0;
  let e = 1e-9;
  for (let i = 0; i < buf.length - lag; i++) {
    c += buf[i] * buf[i + lag];
    e += buf[i] * buf[i];
  }
  return c / Math.sqrt(e0 * e);
}

/** High-frequency rolloff: how much the upper band is suppressed vs the low band. */
function spectralRolloff(
  freq: Float32Array<ArrayBuffer>,
  sampleRate: number,
): number {
  const binHz = sampleRate / 2 / freq.length;
  let low = 1e-9;
  let high = 1e-9;
  for (let i = 0; i < freq.length; i++) {
    const hz = i * binHz;
    const amp = Math.pow(10, freq[i] / 20);
    if (hz < 900) low += amp;
    else if (hz > 3000 && hz < 11000) high += amp;
  }
  const ratio = Math.log10((low + 1) / (high + 1));
  return clamp01((ratio - 0.6) / 2.6);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
