class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(Math.round(sampleRate * 6));
    this.used = 0;
    this.outstanding = false;
    this.pendingGap = null;
    this.lastBlockMs = null;
    this.captureStartedMs = null;
    this.port.onmessage = (event) => {
      if (event.data === "ack") this.outstanding = false;
      if (event.data === "flush") {
        this.emit();
        this.emitGap();
        this.port.postMessage({ flushed: true });
      }
    };
  }
  gap(startMs, durationSec, reason) {
    if (this.pendingGap) this.pendingGap.durationSec += durationSec;
    else this.pendingGap = { captureStartedMs: startMs, durationSec, reason };
  }
  emitGap() {
    if (this.pendingGap) {
      this.port.postMessage({ gap: this.pendingGap });
      this.pendingGap = null;
    }
  }
  emit() {
    if (!this.used) return;
    const durationSec = this.used / sampleRate;
    if (this.outstanding) {
      // At most one transferred audio buffer awaits the UI thread. A throttled
      // tab cannot accumulate recordings in its MessagePort queue.
      this.gap(
        this.captureStartedMs,
        durationSec,
        "Capture transport backlog: audio not analyzed",
      );
    } else {
      this.emitGap();
      const samples = this.samples.slice(0, this.used);
      this.outstanding = true;
      this.port.postMessage(
        {
          samples,
          sampleRate,
          captureStartedMs: this.captureStartedMs,
          durationSec,
        },
        [samples.buffer],
      );
    }
    this.used = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    const now = Date.now();
    if (this.lastBlockMs !== null && now - this.lastBlockMs > 1000) {
      this.gap(
        this.captureStartedMs ?? this.lastBlockMs,
        (now - this.lastBlockMs) / 1000 + this.used / sampleRate,
        "Audio render interrupted: discarded discontinuous segment",
      );
      this.used = 0;
    }
    this.lastBlockMs = now;
    for (const value of input) {
      if (!this.used) this.captureStartedMs = now;
      this.samples[this.used++] = value;
      if (this.used === this.samples.length) this.emit();
    }
    return true;
  }
}
registerProcessor("trustlens-capture", CaptureProcessor);
