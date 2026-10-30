import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Copy,
  Loader2,
  Mic,
  Plug,
  ShieldCheck,
  Square,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import LocalVoiceLedgerActions from "./LocalVoiceLedgerActions";
import { useLocalLiveVoice } from "@/hooks/use-local-live-voice";
import {
  isLocalCompanion,
  LocalVoiceClient,
  pause,
  type VoiceHealth,
  type VoiceJob,
} from "@/lib/local-voice";

export default function LocalVoiceCheck({
  embedded = false,
  ledgerEnabled = false,
  live = false,
  transport,
}: {
  embedded?: boolean;
  ledgerEnabled?: boolean;
  live?: boolean;
  transport?: LocalVoiceClient;
}) {
  const hosted = Boolean(transport);
  const maxAudioBytes = (hosted ? 3 : 20) * 1024 * 1024;
  const [key, setKey] = useState("");
  const [health, setHealth] = useState<VoiceHealth | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [model, setModel] = useState("v4");
  const [job, setJob] = useState<VoiceJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [micPending, setMicPending] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [copied, setCopied] = useState(false);
  const client = useRef(transport ?? new LocalVoiceClient());
  const liveVoice = useLocalLiveVoice(() => client.current, model);
  const liveLocked = liveVoice.active || liveVoice.starting || liveVoice.busy;
  const active = useRef<{ controller: AbortController; id?: string } | null>(
    null,
  );
  const recorder = useRef<MediaRecorder | null>(null);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewUrl = useRef("");

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.controller.abort();
      if (active.current?.id)
        void client.current.cancel(active.current.id).catch(() => {});
      if (timer.current) clearInterval(timer.current);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      const rec = recorder.current;
      if (rec && rec.state !== "inactive") rec.stop();
      rec?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!connected) return;
    let live = true;
    const id = setInterval(() => {
      void client.current
        .health()
        .then((value) => {
          if (live) setHealth(value);
        })
        .catch((err) => {
          if (live) {
            setConnected(false);
            setError(err.message);
          }
        });
    }, 4000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [connected]);

  async function connect() {
    setConnecting(true);
    setError("");
    setCopied(false);
    try {
      let pairingKey = key.trim();
      if (!transport) {
        const probe = new LocalVoiceClient();
        if (isLocalCompanion()) pairingKey = (await probe.pairing()).key;
        if (!pairingKey) throw new Error("Run Start-VoiceSentinel.cmd and connect the local companion.");
      }
      const next = transport ?? new LocalVoiceClient(pairingKey);
      const status = await next.health();
      if (status.service !== "trustlens-local-voice")
        throw new Error("The voice detector returned an unexpected service identity.");
      // Verify access without starting inference.
      await next.request("/session");
      if (mounted.current) {
        client.current = next;
        setKey(pairingKey);
        setHealth(status);
        setConnected(true);
      }
    } catch (err) {
      if (mounted.current) {
        setConnected(false);
        setError(err instanceof Error ? err.message : "Connection failed.");
      }
    } finally {
      if (mounted.current) setConnecting(false);
    }
  }

  function choose(next: File | null) {
    setJob(null);
    setError("");
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = "";
    setPreview("");
    if (next && next.size > maxAudioBytes) {
      setFile(null);
      setError(`Choose audio no larger than ${hosted ? "3 MiB" : "20 MB"}.`);
      return;
    }
    previewUrl.current = next ? URL.createObjectURL(next) : "";
    setPreview(previewUrl.current);
    setFile(next);
  }

  async function analyze() {
    if (!file || busy) return;
    const current = {
      controller: new AbortController(),
      id: undefined as string | undefined,
    };
    active.current = current;
    setBusy(true);
    setJob(null);
    setError("");
    try {
      // Let submission finish even if cancelled so its job ID can be cancelled too.
      let update = await client.current.submit(
        file,
        model,
        AbortSignal.timeout(30_000),
      );
      current.id = update.id;
      if (current.controller.signal.aborted) {
        await client.current.cancel(update.id);
        return;
      }
      while (!current.controller.signal.aborted) {
        if (mounted.current) setJob(update);
        if (update.status === "done" || update.status === "cancelled") break;
        if (update.status === "error")
          throw new Error(update.error || "Analysis failed.");
        await pause(600, current.controller.signal);
        update = await client.current.job(update.id, current.controller.signal);
      }
    } catch (err) {
      if (!current.controller.signal.aborted) {
        if (current.id) void client.current.cancel(current.id).catch(() => {});
        if (mounted.current)
          setError(err instanceof Error ? err.message : "Analysis failed.");
      }
    } finally {
      if (active.current === current) {
        active.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }

  async function cancel() {
    const current = active.current;
    current?.controller.abort();
    setJob(null);
    if (current?.id) {
      try {
        await client.current.cancel(current.id);
      } catch (err) {
        if (mounted.current)
          setError(
            err instanceof Error
              ? err.message
              : "Could not confirm cancellation.",
          );
      }
    }
  }

  async function record() {
    setError("");
    setMicPending(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "Microphone recording is unavailable in this browser. Upload an audio file instead.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(stream);
      } catch (err) {
        stream.getTracks().forEach((track) => track.stop());
        throw err;
      }
      recorder.current = rec;
      const chunks: Blob[] = [];
      let size = 0;
      let recordingFailed = false;
      rec.ondataavailable = (event) => {
        if (event.data.size) {
          size += event.data.size;
          chunks.push(event.data);
        }
        if (size >= maxAudioBytes && rec.state === "recording") rec.stop();
      };
      rec.onerror = () => {
        recordingFailed = true;
        stream.getTracks().forEach((track) => track.stop());
        if (timer.current) clearInterval(timer.current);
        if (mounted.current) {
          setRecording(false);
          setError("Microphone recording failed. Try uploading a file.");
        }
      };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timer.current) clearInterval(timer.current);
        if (mounted.current) {
          setRecording(false);
          if (recordingFailed) return;
          const type = rec.mimeType || "audio/webm";
          choose(
            new File(
              chunks,
              `microphone.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`,
              { type },
            ),
          );
        }
      };
      choose(null);
      setSeconds(0);
      setRecording(true);
      try {
        rec.start(1000);
      } catch (err) {
        rec.onstop = null;
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        throw err;
      }
      const started = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 120 && rec.state === "recording") rec.stop();
      }, 250);
    } catch (err) {
      if (mounted.current)
        setError(
          err instanceof Error ? err.message : "Microphone permission denied.",
        );
    } finally {
      if (mounted.current) setMicPending(false);
    }
  }

  const displayedJob = live ? liveVoice.job : job;
  const result = displayedJob?.status === "done" ? displayedJob.result : undefined;
  return (
    <section className="space-y-6" aria-labelledby="voice-title">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {hosted ? "VoiceSentinel · Shared detector" : "VoiceSentinel · Local demo"}
        </p>
        <h2
          id="voice-title"
          className="font-display text-3xl font-semibold tracking-tight"
        >
          {live ? (hosted ? "Live voice · shared model" : "Live voice · local model") : embedded ? "Human or AI voice" : "Check a voice recording"}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {hosted
            ? "Your audio is sent through TrustLens to the operator's laptop for voice detection. No model installation or pairing key is needed. This experimental check does not transcribe or assess scam language."
            : live
            ? "Place the call on speaker near your microphone. VoiceSentinel checks six-second speech samples on this computer. This mode checks voice characteristics; it does not transcribe or check the words for scams."
            : "Upload a voice note or record your microphone. The trained detector runs on this computer, with no paid API or cloud audio upload."}
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Plug className="size-5 text-primary" />
            <div>
              <h2 className="font-semibold">{hosted ? "Shared detector" : "Local detector"}</h2>
              <p role="status" className="text-sm text-muted-foreground">
                {connected
                  ? health?.state === "ready"
                    ? (hosted ? "Connected · shared detector ready" : "Connected · ready on your laptop")
                    : health?.state === "error"
                      ? health.error
                      : "Connected · loading the model (first start can take a few minutes)"
                  : (hosted ? "Connect to the shared detector. Availability depends on the operator’s laptop." : "Run Start-VoiceSentinel.cmd on port 8765, then connect.")}
              </p>
            </div>
          </div>
          <Button
            onClick={() => void connect()}
            disabled={connecting || busy || recording || liveLocked}
          >
            {connecting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {connected ? "Reconnect" : hosted ? "Connect detector" : "Connect local detector"}
          </Button>
        </div>
        {!hosted && !isLocalCompanion() && (
          <div className="space-y-2">
            <label htmlFor="pairing-key" className="text-sm font-medium">
              Pairing key from your laptop
            </label>
            <input
              id="pairing-key"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setConnected(false);
              }}
              disabled={busy || connecting || liveLocked}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Open{" "}
              <a
                className="underline"
                href="http://127.0.0.1:8765/pair"
                target="_blank"
                rel="noreferrer"
              >
                the VoiceSentinel pairing page (port 8765)
              </a>
              , click Copy pairing key, and paste it above. Allow Local network access if Chrome
              asks. The key changes when the service restarts.
            </p>
          </div>
        )}
        {!hosted && isLocalCompanion() && connected && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard
                .writeText(key)
                .then(() => setCopied(true))
                .catch(() =>
                  setError(
                    "Clipboard access was blocked. Allow clipboard access for this page and try again.",
                  ),
                );
            }}
          >
            <Copy className="mr-2 size-4" />
            {copied ? "Key copied" : "Copy key for hosted TrustLens"}
          </Button>
        )}
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-7 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <AudioLines className="size-5 text-primary" />
            {live ? "Live microphone" : "Your recording"}
          </h2>
          <div className="flex items-center gap-2">
            <label className="text-sm" htmlFor="voice-model">
              Model
            </label>
            <select
              id="voice-model"
              value={model}
              disabled={busy || recording || liveLocked}
              onChange={(e) => {
                setModel(e.target.value);
                setJob(null);
              }}
              className="rounded-lg border border-input bg-background p-2 text-sm"
            >
              <option value="v4">v4 · default</option>
              <option
                value="v5"
                disabled={connected && !health?.models.includes("v5")}
              >
                v5 · research
              </option>
            </select>
          </div>
        </div>
        {model === "v5" && (
          <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            v5 remains experimental and misses some compressed AI voices.
            Research/demo use only; its MLAAD training data has a noncommercial
            license.
          </p>
        )}
        {live ? (
          <div className="space-y-3">
            <Button
              disabled={!liveLocked && (!connected || health?.state !== "ready") || (!liveVoice.active && !liveVoice.starting && liveVoice.busy)}
              onClick={() => liveVoice.active || liveVoice.starting ? liveVoice.stop() : void liveVoice.start()}
            >
              {liveVoice.active || liveVoice.starting ? <Square className="mr-2 size-4" /> : <Mic className="mr-2 size-4" />}
              {liveVoice.active || liveVoice.starting ? (hosted ? "Stop voice check" : "Stop local check") : (hosted ? "Start voice check" : "Start local check")}
            </Button>
            <p role="status" className="text-sm text-muted-foreground">
              {liveVoice.starting ? "Waiting for microphone…" : liveVoice.active
                ? liveVoice.speech ? "Listening · speech detected" : "Listening · waiting for clear speech"
                : liveVoice.busy ? "Microphone stopped · finishing captured speech…" : "Microphone off"}
              {liveVoice.active && liveVoice.busy ? (hosted ? " · analyzing on shared detector" : " · analyzing locally") : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Silent samples are skipped. Results update as the detector finishes each check.
              The newest waiting sample replaces older waiting samples while analysis is busy.
              Stop the check to review and save the latest completed result.
            </p>
          </div>
        ) : (<>
        <label className="block rounded-xl border-2 border-dashed border-border p-6 text-center">
          <Upload className="mx-auto mb-3 size-7 text-muted-foreground" />
          <span className="block font-medium">Choose an audio file</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            MP3, WAV, M4A, WebM, OGG, AAC or FLAC · 1–120 seconds · up to {hosted ? "3 MiB" : "20 MB"}
          </span>
          <input
            aria-label="Choose audio file"
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg,.aac,.flac"
            disabled={busy || recording || micPending}
            onChange={(e) => choose(e.target.files?.[0] || null)}
            className="mt-4 max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-secondary-foreground"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={busy || micPending}
            onClick={() =>
              recording ? recorder.current?.stop() : void record()
            }
          >
            {recording ? (
              <Square className="mr-2 size-4" />
            ) : (
              <Mic className="mr-2 size-4" />
            )}
            {recording
              ? `Stop recording · ${seconds}s`
              : micPending
                ? "Waiting for microphone…"
                : "Record microphone"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Record first, then analyze. Microphone stops automatically at 120
            seconds.
          </p>
        </div>
        {file && (
          <div className="rounded-xl bg-muted/50 p-4 space-y-2">
            <p className="break-all text-sm font-medium">{file.name}</p>
            {preview && <audio controls src={preview} className="w-full" />}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button
            disabled={
              !connected ||
              health?.state !== "ready" ||
              !file ||
              busy ||
              recording ||
              micPending
            }
            onClick={() => void analyze()}
          >
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 size-4" />
            )}
            {busy ? "Analyzing locally…" : "Analyze recording"}
          </Button>
          {busy && (
            <Button variant="outline" onClick={() => void cancel()}>
              Cancel
            </Button>
          )}
        </div>
        {busy && (
          <div
            role="status"
            className="space-y-2 text-sm text-muted-foreground"
          >
            <p>
              {job?.total
                ? `Analyzed ${job.completed} of ${job.total} audio windows`
                : "Preparing audio and waiting for the local detector…"}
            </p>
            <progress
              aria-label="Audio analysis progress"
              className="h-2 w-full accent-primary"
              value={job?.completed || 0}
              max={job?.total || 1}
            />
          </div>
        )}
        </>)}
      </div>
      {(error || (live && liveVoice.error)) && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {error || liveVoice.error}
        </p>
      )}
      {result && (
        <div
          role="status"
          className="rounded-2xl border border-border bg-card p-6 space-y-4"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {result.model} experimental model vote
            </p>
            <h2 className="mt-1 text-3xl font-semibold">{result.vote}</h2>
            <p className="mt-2 font-medium text-amber-800 dark:text-amber-300">
              Assessment: {result.assessment}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Model score", result.score.toFixed(5)],
              ["Threshold", result.threshold.toFixed(5)],
              ["Audio", `${result.seconds}s · ${result.windows} windows`],
              [
                "Check time",
                `${displayedJob?.elapsed}s${result.cached ? " · cached features" : ""}`,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {result.note} A human-like vote does not establish that a caller is
            trustworthy.
          </p>
          {live && liveLocked ? (
            <p className="text-xs text-muted-foreground">Latest completed sample. Stop the local check and wait for analysis to finish to add it to your ledger or alert your circle.</p>
          ) : ledgerEnabled ? (
            <LocalVoiceLedgerActions key={displayedJob?.id} result={result} checkTimeSec={displayedJob?.elapsed} />
          ) : (
            <p className="border-t border-border pt-4 text-xs text-muted-foreground">
              Open this check in connected TrustLens to add results to your ledger or alert your circle.
            </p>
          )}
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {hosted ? "Audio passes through Convex and is processed on the operator's laptop. This feature does not save raw audio to the ledger." : "Audio is processed on this computer."} Temporary decoding files are
        deleted after decoding; results and derived features expire from memory
        after about 15 minutes. Results are added to cloud history only when you
        choose Add to ledger. Circle alerts require the separate alert option.
      </p>
    </section>
  );
}
