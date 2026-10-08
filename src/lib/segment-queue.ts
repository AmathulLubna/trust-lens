/** One queue per session. Bounded waiting audio, original capture timestamps,
 * visible gaps, and an exactly-once finalization promise. */
export interface Segment<T> {
  sequence: number;
  offsetSec: number;
  durationSec: number;
  data: T;
}
export interface CoverageGap {
  sequence: number;
  offsetSec: number;
  durationSec: number;
  reason: string;
}
export class SegmentQueue<T, R> {
  private pending: Segment<T>[] = [];
  private running: Segment<T> | null = null;
  private sealed = false;
  private ignored = false;
  private next = 0;
  private finishPromise: Promise<void> | null = null;
  private wake: (() => void) | null = null;
  readonly gaps: CoverageGap[] = [];
  private process: (s: Segment<T>) => Promise<R>;
  private onResult: (r: R, s: Segment<T>) => void;
  private onGap: (g: CoverageGap) => void;
  private capacity: number;
  constructor(
    process: (s: Segment<T>) => Promise<R>,
    onResult: (r: R, s: Segment<T>) => void,
    onGap: (g: CoverageGap) => void,
    capacity = 3,
  ) {
    this.process = process;
    this.onResult = onResult;
    this.onGap = onGap;
    this.capacity = capacity;
  }
  get expectedSegments() {
    return this.next;
  }
  push(data: T, offsetSec: number, durationSec: number) {
    if (this.sealed) return;
    const segment = { data, offsetSec, durationSec, sequence: this.next++ };
    if (this.pending.length >= this.capacity) {
      this.gap(segment, "Processing backlog: audio not analyzed");
      return;
    }
    this.pending.push(segment);
    void this.pump();
  }
  recordGap(offsetSec: number, durationSec: number, reason: string) {
    if (this.sealed) return;
    this.gap({ sequence: this.next++, offsetSec, durationSec }, reason);
  }
  private gap(s: Omit<Segment<T>, "data">, reason: string) {
    const g = {
      sequence: s.sequence,
      offsetSec: s.offsetSec,
      durationSec: s.durationSec,
      reason,
    };
    this.gaps.push(g);
    this.onGap(g);
  }
  private async pump() {
    if (this.running || this.ignored) return;
    const segment = this.pending.shift();
    if (!segment) {
      this.wake?.();
      return;
    }
    this.running = segment;
    try {
      const result = await this.process(segment);
      if (!this.ignored) this.onResult(result, segment);
    } catch {
      if (!this.ignored) this.gap(segment, "Analysis failed or unavailable");
    } finally {
      this.running = null;
      if (!this.ignored) void this.pump();
    }
  }
  finish(timeoutMs = 35000): Promise<void> {
    if (this.finishPromise) return this.finishPromise;
    this.sealed = true;
    this.finishPromise = new Promise((resolve) => {
      const complete = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
      const timer = setTimeout(() => {
        this.ignored = true;
        if (this.running)
          this.gap(this.running, "Finalization deadline exceeded");
        for (const s of this.pending)
          this.gap(s, "Finalization deadline exceeded");
        this.pending = [];
        complete();
      }, timeoutMs);
      this.wake = complete;
      if (!this.running && !this.pending.length) complete();
    });
    return this.finishPromise;
  }
  cancel() {
    this.sealed = true;
    this.ignored = true;
    this.pending = [];
    this.wake?.();
  }
}
