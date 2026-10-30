export const LOCAL_VOICE_URL = "http://127.0.0.1:8765";
export const isLocalCompanion = () =>
  ["http://127.0.0.1:8765", "http://localhost:8765"].includes(
    window.location.origin,
  );

export type VoiceHealth = {
  state: "warming" | "ready" | "error";
  models: string[];
  error: string | null;
  service: string;
};
export type VoiceResult = {
  model: string;
  score: number;
  threshold: number;
  vote: string;
  assessment: string;
  seconds: number;
  windows: number;
  cached: boolean;
  note: string;
};
export type VoiceJob = {
  id: string;
  status: "queued" | "running" | "cancelling" | "cancelled" | "done" | "error";
  completed: number;
  total: number;
  result?: VoiceResult;
  error?: string;
  elapsed?: number;
};

export class LocalVoiceClient {
  constructor(privateKey = "") {
    this.key = privateKey;
  }
  private key: string;

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const base = isLocalCompanion() ? window.location.origin : LOCAL_VOICE_URL;
    const timeout = AbortSignal.timeout(30_000);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    let response: Response;
    try {
      response = await fetch(`${base}/api/voice${path}`, {
        ...init,
        signal,
        credentials: "omit",
        cache: "no-store",
        headers: {
          ...(this.key ? { "X-TrustLens-Key": this.key } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new Error(
        "Cannot reach VoiceSentinel on port 8765. Run Start-VoiceSentinel.cmd on this computer, open http://127.0.0.1:8765/pair to copy the key, then reconnect. Allow Local network access if your browser asks.",
      );
    }
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : `Local service error (${response.status}).`,
      );
    return data as T;
  }

  health = () => this.request<VoiceHealth>("/health");
  pairing = () => this.request<{ key: string }>("/pairing");
  submit = (file: Blob, model: string, signal: AbortSignal) =>
    this.request<VoiceJob>(`/jobs?model=${encodeURIComponent(model)}`, {
      method: "POST",
      body: file,
      headers: { "Content-Type": "application/octet-stream" },
      signal,
    });
  job = (id: string, signal: AbortSignal) =>
    this.request<VoiceJob>(`/jobs/${encodeURIComponent(id)}`, { signal });
  cancel = (id: string) =>
    this.request<VoiceJob>(`/jobs/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
}

export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}
