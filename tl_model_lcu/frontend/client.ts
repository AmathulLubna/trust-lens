import { LocalVoiceClient } from "../../src/lib/local-voice";
import type { ModelArgs, ModelReply } from "../convex/model";

export class ConvexVoiceClient extends LocalVoiceClient {
  private run: (args: ModelArgs) => Promise<ModelReply>;

  constructor(run: (args: ModelArgs) => Promise<ModelReply>) {
    super();
    this.run = run;
  }

  override async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    init.signal?.throwIfAborted();
    let args: ModelArgs;
    if (path === "/health" || path === "/session") {
      args = { operation: path === "/health" ? "health" : "session" };
    } else if (path.startsWith("/jobs?")) {
      const model = new URLSearchParams(path.split("?")[1]).get("model");
      if (model !== "v4" && model !== "v5") throw new Error("Unknown voice model.");
      const file = init.body;
      if (!(file instanceof Blob) || file.size === 0 || file.size > 3 * 1024 * 1024) {
        throw new Error("Choose audio no larger than 3 MiB.");
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      args = { operation: "submit", model, audioBase64: btoa(binary) };
    } else if (/^\/jobs\/[A-Za-z0-9_-]{1,64}$/.test(path)) {
      args = { operation: init.method === "DELETE" ? "cancel" : "job", id: path.slice(6) };
    } else {
      throw new Error("Unsupported voice operation.");
    }
    init.signal?.throwIfAborted();
    const result = await this.run(args);
    // Always return a submitted ID so existing hooks can cancel an allocated job.
    if (args.operation !== "submit") init.signal?.throwIfAborted();
    return result as T;
  }
}
