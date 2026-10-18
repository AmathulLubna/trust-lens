/** Serial work with explicit backpressure; failures never strand later tasks. */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;

  private readonly capacity: number;
  constructor(capacity = 20) {
    this.capacity = capacity;
  }

  enqueue(task: () => Promise<void>): Promise<void> {
    if (this.pending >= this.capacity)
      return Promise.reject(
        new Error(
          "Transcription is falling behind. Pause and wait for queued audio to finish.",
        ),
      );
    this.pending += 1;
    const result = this.tail.then(task);
    this.tail = result
      .catch(() => undefined)
      .finally(() => {
        this.pending -= 1;
      });
    return result;
  }

  async drain(): Promise<void> {
    await this.tail;
  }
}
