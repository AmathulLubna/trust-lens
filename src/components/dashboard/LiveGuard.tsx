import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { type Assessment, summarizeSession } from "@/lib/assessment";
import { SCENARIO } from "@/lib/trustlens";
import { uploadAudio, pcmWav } from "@/lib/audio-upload";
import { SegmentQueue, type CoverageGap } from "@/lib/segment-queue";
import { Button } from "@/components/ui/button";
import AssessmentView from "./AssessmentView";
import captureUrl from "@/lib/capture.worklet.js?url";

type Capture = { samples: Float32Array; sampleRate: number };
type Session = {
  id: string;
  startedAt: number;
  queue: SegmentQueue<Capture, Assessment>;
  context: AudioContext;
  stream: MediaStream;
  node: AudioWorkletNode;
  results: Assessment[];
  closed: boolean;
  timer: ReturnType<typeof setInterval> | null;
  flushed: (() => void) | null;
  stopPromise: Promise<void> | null;
  captureStopped: boolean;
  endedAt: number | null;
};
export default function LiveGuard() {
  const token = useAuthToken();
  const analyze = useAction(api.acoustic.analyze);
  const finalize = useMutation(api.audio.finishSession);
  const settings = useQuery(api.settings.get);
  const session = useRef<Session | null>(null);
  const mounted = useRef(true);
  const [phase, setPhase] = useState<
    "idle" | "starting" | "capturing" | "finalizing" | "done"
  >("idle");
  const [consent, setConsent] = useState(false);
  const [retain, setRetain] = useState(false);
  const [language, setLanguage] = useState<"auto" | "hi" | "en">("auto");
  const [result, setResult] = useState<Assessment | null>(null);
  const [gaps, setGaps] = useState<CoverageGap[]>([]);
  const [message, setMessage] = useState("");
  const [demo, setDemo] = useState(false);
  const stopRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void stopRef.current();
    };
  }, []);

  async function stop() {
    const s = session.current;
    if (!s) return;
    if (s.stopPromise) return s.stopPromise;
    s.closed = true;
    s.endedAt ??= Date.now();
    if (mounted.current) setPhase("finalizing");
    s.stopPromise = (async () => {
      if (!s.captureStopped) {
        if (s.timer) clearInterval(s.timer);
        // Capture flush must complete before sealing the queue.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            s.queue.recordGap(
              (Date.now() - s.startedAt) / 1000,
              0,
              "Final audio flush was not acknowledged",
            );
            s.flushed = null;
            resolve();
          }, 750);
          s.flushed = () => {
            clearTimeout(timer);
            s.flushed = null;
            resolve();
          };
          s.node.port.postMessage("flush");
        });
        s.stream.getTracks().forEach((t) => t.stop());
        s.node.disconnect();
        await s.context.close();
        await s.queue.finish();
        s.captureStopped = true;
      }
      const summary = summarizeSession(s.results, s.queue.gaps.length);
      if (mounted.current && session.current === s) {
        setResult(summary);
        setGaps([...s.queue.gaps]);
      }
      try {
        await finalize({
          eventId: s.id,
          expectedSegments: s.queue.expectedSegments,
          startedAt: s.startedAt,
          durationSec: ((s.endedAt ?? Date.now()) - s.startedAt) / 1000,
        });
        if (mounted.current && session.current === s)
          setMessage(
            "Session finalized and saved once. Notification delivery status is available in history.",
          );
      } catch {
        if (mounted.current && session.current === s)
          setMessage(
            "History could not be saved. Retry finalization when the connection returns.",
          );
        throw new Error("Finalization unavailable");
      } finally {
        if (mounted.current && session.current === s) setPhase("done");
      }
    })();
    // Do not leave unhandled failures on navigation; permit explicit retry.
    try {
      await s.stopPromise;
    } catch {
      s.stopPromise = null;
    }
  }
  useEffect(() => {
    stopRef.current = stop;
  });
  async function start() {
    if (
      !consent ||
      phase === "capturing" ||
      phase === "finalizing" ||
      phase === "starting"
    )
      return;
    setPhase("starting");
    setMessage("");
    setResult(null);
    setGaps([]);
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (!mounted.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      context = new AudioContext();
      await context.audioWorklet.addModule(captureUrl);
      if (!mounted.current) {
        stream.getTracks().forEach((t) => t.stop());
        await context.close();
        return;
      }
      const node = new AudioWorkletNode(context, "trustlens-capture");
      const source = context.createMediaStreamSource(stream);
      const muted = context.createGain();
      muted.gain.value = 0;
      source.connect(node);
      node.connect(muted);
      muted.connect(context.destination);
      const id = crypto.randomUUID();
      const startedAt = Date.now();
      const s: Session = {
        id,
        startedAt,
        context,
        stream,
        node,
        results: [],
        closed: false,
        timer: null,
        flushed: null,
        stopPromise: null,
        captureStopped: false,
        endedAt: null,
        queue: null as unknown as SegmentQueue<Capture, Assessment>,
      };
      let warned = false;
      s.queue = new SegmentQueue(
        async (segment) => {
          const storageId = await uploadAudio(
            pcmWav(segment.data.samples, segment.data.sampleRate),
            "microphone.wav",
            token,
          );
          const response = await analyze({
            storageId,
            eventId: id,
            sequence: segment.sequence,
            offsetSec: segment.offsetSec,
            source: "microphone",
            retainTranscript: retain,
            language,
          });
          return response.result;
        },
        (assessment, segment) => {
          s.results.push({
            ...assessment,
            sequence: segment.sequence,
            offsetSec: segment.offsetSec,
          });
          if (!mounted.current || session.current !== s) return;
          setResult(summarizeSession(s.results, s.queue.gaps.length));
          if (assessment.outcome === "suspicious" && !warned) {
            warned = true;
            if (settings?.vibrationAlert && navigator.vibrate)
              navigator.vibrate([120, 60, 120]);
            if (settings?.bannerAlert)
              setMessage("Pause the request and verify independently.");
          }
        },
        () => {
          if (mounted.current && session.current === s)
            setGaps([...s.queue.gaps]);
        },
      );
      session.current = s;
      node.port.onmessage = (event) => {
        if (session.current !== s) return;
        if (event.data.flushed) {
          s.flushed?.();
          return;
        }
        if (event.data.gap) {
          const gap = event.data.gap;
          s.queue.recordGap(
            Math.max(0, (gap.captureStartedMs - startedAt) / 1000),
            gap.durationSec,
            gap.reason,
          );
          return;
        }
        if (event.data.samples instanceof Float32Array) {
          node.port.postMessage("ack");
          s.queue.push(
            { samples: event.data.samples, sampleRate: event.data.sampleRate },
            Math.max(0, (event.data.captureStartedMs - startedAt) / 1000),
            event.data.durationSec,
          );
        }
      };
      let lastTick = Date.now();
      s.timer = setInterval(() => {
        const now = Date.now();
        if (now - lastTick > 12000 || s.context.state !== "running")
          s.queue.recordGap(
            (lastTick - startedAt) / 1000,
            (now - lastTick) / 1000,
            "Capture interrupted or browser suspended; coverage is uncertain",
          );
        lastTick = now;
        if (now - startedAt >= 10 * 60 * 1000) void stopRef.current();
      }, 6000);
      stream.getTracks().forEach((track) =>
        track.addEventListener("ended", () => {
          if (!s.closed) void stopRef.current();
        }),
      );
      await context.resume();
      setPhase("capturing");
    } catch (error) {
      stream?.getTracks().forEach((t) => t.stop());
      if (context && context.state !== "closed") await context.close();
      setMessage(
        error instanceof Error ? error.message : "Microphone unavailable",
      );
      setPhase("idle");
    }
  }
  const active =
    phase === "capturing" || phase === "starting" || phase === "finalizing";
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-xl border p-4 space-y-2">
        <h2 className="font-semibold">Controlled two-party call</h2>
        <p className="text-sm">Make a consenting browser call and analyze the received caller audio. This prototype uses separate operator-issued demo credentials and requires a configured analysis server.</p>
        {!active && <Button asChild><a href="/demo/index.html" target="_blank" rel="noopener noreferrer">Open browser call demo</a></Button>}
      </section>
      <h1 className="text-2xl font-bold">Microphone screening</h1>
      <p>
        This screen analyzes nearby microphone audio. It cannot directly capture
        cellular or WhatsApp remote audio, identify speakers, or guarantee
        coverage while the browser is suspended. Maximum session: ten minutes.
      </p>
      <p className="rounded-xl border p-4 text-sm">
        Each six-second segment is sent through authenticated temporary storage
        to the configured Python acoustic and transcription service. Captured
        offsets identify when the audio occurred. A backlog or service failure
        remains visible. Temporary audio is deleted after analysis or expires
        after 15 minutes.
      </p>
      <label className="block">
        <input
          type="checkbox"
          checked={consent}
          disabled={active}
          onChange={(e) => setConsent(e.target.checked)}
        />{" "}
        I have permission from participants to process this microphone audio.
      </label>
      <label className="block">
        <input
          type="checkbox"
          checked={retain}
          disabled={active}
          onChange={(e) => setRetain(e.target.checked)}
        />{" "}
        Save this session's transcript in history (optional; off by default).
      </label>
      <label className="block">
        Transcription language{" "}
        <select
          disabled={active}
          value={language}
          onChange={(e) => setLanguage(e.target.value as typeof language)}
        >
          <option value="auto">Auto</option>
          <option value="hi">Hindi</option>
          <option value="en">English</option>
        </select>
      </label>
      <div className="flex gap-3">
        <Button disabled={!consent || active} onClick={() => void start()}>
          Start microphone
        </Button>
        <Button disabled={phase !== "capturing"} onClick={() => void stop()}>
          Stop and finalize
        </Button>
        {phase === "done" && message.startsWith("History could") && (
          <Button onClick={() => void stop()}>Retry saving</Button>
        )}
      </div>
      <p role="status">
        Session: {phase}. {message}
      </p>
      {gaps.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-500 p-4">
          <strong>Coverage gaps: {gaps.length}</strong>
          <ul>
            {gaps.map((g) => (
              <li key={g.sequence}>
                Segment {g.sequence} at {g.offsetSec.toFixed(1)}s: {g.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result && <AssessmentView result={result} />}
      <details open={demo} onToggle={(e) => setDemo(e.currentTarget.open)}>
        <summary>Scripted demonstration · illustrative walkthrough</summary>
        <p>
          No microphone, inference, alerts, or history records are generated by
          this script.
        </p>
        {SCENARIO.map((line) => (
          <p key={line.t}>
            <strong>
              {line.speaker} at {line.t}s:
            </strong>{" "}
            {line.text}
          </p>
        ))}
        <p>
          Illustrative action: pause the payment and independently contact the
          claimed person.
        </p>
      </details>
    </div>
  );
}
