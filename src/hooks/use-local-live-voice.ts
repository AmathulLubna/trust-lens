import { useEffect, useRef, useState } from "react";
import { LocalVoiceClient, pause, type VoiceJob } from "@/lib/local-voice";
import { VoiceAnalyzer } from "@/lib/voice-analysis";
import { SpeechGate } from "@/lib/speech-gate";

type Session = {
  client: LocalVoiceClient;
  model: string;
  analyzer: VoiceAnalyzer;
  controller: AbortController;
  listening: boolean;
  recorder?: MediaRecorder;
  segmentTimer?: ReturnType<typeof setTimeout>;
  sampleTimer?: ReturnType<typeof setInterval>;
  gate?: SpeechGate;
  pending?: Blob;
  processing: boolean;
  stopping?: boolean;
  jobId?: string;
};

function stopCapture(session: Session) {
  session.listening = false;
  clearTimeout(session.segmentTimer);
  clearInterval(session.sampleTimer);
  if (session.recorder && session.recorder.state !== "inactive") session.recorder.stop();
  session.analyzer.stop();
}

export function useLocalLiveVoice(getClient: () => LocalVoiceClient, model: string) {
  const current = useRef<Session | null>(null);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<VoiceJob | null>(null);
  const [error, setError] = useState("");
  const [speech, setSpeech] = useState(false);

  async function processLatest(session: Session) {
    if (session.processing || session.controller.signal.aborted) return;
    session.processing = true;
    setBusy(true);
    try {
      while (session.pending && !session.controller.signal.aborted) {
        const audio = session.pending;
        session.pending = undefined;
        // Finish submission so cancellation can also cancel the allocated job.
        let update = await session.client.submit(audio, session.model, AbortSignal.timeout(30_000));
        session.jobId = update.id;
        if (session.controller.signal.aborted) {
          await session.client.cancel(update.id);
          return;
        }
        while (update.status === "queued" || update.status === "running" || update.status === "cancelling") {
          await pause(600, session.controller.signal);
          update = await session.client.job(update.id, session.controller.signal);
        }
        if (session.controller.signal.aborted) return;
        if (update.status !== "done" || !update.result)
          throw new Error(update.error || "Local analysis was cancelled. Start again to retry.");
        setJob(update);
        session.jobId = undefined;
      }
    } catch (err) {
      if (!session.controller.signal.aborted) {
        // Abort before stopping the recorder: its final chunk must not enqueue
        // another job after an error.
        session.controller.abort();
        session.pending = undefined;
        session.stopping = false;
        stopCapture(session);
        if (session.jobId) void session.client.cancel(session.jobId).catch(() => {});
        setActive(false);
        setSpeech(false);
        setError(err instanceof Error ? err.message : "Local voice analysis failed.");
      }
    } finally {
      session.processing = false;
      if (current.current === session) setBusy(Boolean(session.stopping));
    }
  }

  function capture(session: Session, stream: MediaStream) {
    if (!session.listening || session.controller.signal.aborted) return;
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    session.recorder = rec;
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    const gate = new SpeechGate();
    session.gate = gate;
    rec.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    rec.onstop = () => {
      clearTimeout(session.segmentTimer);
      if (session.controller.signal.aborted) return;
      session.stopping = false;
      setBusy(session.processing);
      if (gate.hasSpeech && chunks.length && Date.now() - startedAt >= 1000) {
        // Keep only the newest waiting sample if inference takes longer than
        // capture. Memory and latency stay bounded on slower laptops.
        session.pending = new Blob(chunks, { type: chunks[0].type || mime || "audio/webm" });
        void processLatest(session);
      }
      if (session.listening) {
        try { capture(session, stream); }
        catch { failCapture(session); }
      }
    };
    rec.onerror = () => failCapture(session);
    rec.start();
    session.segmentTimer = setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, 6000);
  }

  function failCapture(session: Session) {
    if (session.controller.signal.aborted) return;
    session.controller.abort();
    session.pending = undefined;
    session.stopping = false;
    stopCapture(session);
    if (session.jobId) void session.client.cancel(session.jobId).catch(() => {});
    setActive(false);
    setStarting(false);
    setSpeech(false);
    setBusy(session.processing);
    setError("Microphone recording failed. Start the local check again.");
  }

  async function start() {
    if (current.current?.listening || current.current?.processing || current.current?.stopping) return;
    const session: Session = {
      client: getClient(), model, analyzer: new VoiceAnalyzer(), controller: new AbortController(),
      listening: true, processing: false,
    };
    current.current = session;
    setStarting(true);
    setError("");
    setJob(null);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
        throw new Error("Microphone recording needs HTTPS or localhost and a supported browser.");
      const stream = await session.analyzer.start();
      if (session.controller.signal.aborted || !session.listening) {
        session.analyzer.stop();
        return;
      }
      capture(session, stream);
      session.sampleTimer = setInterval(() => {
        const metrics = session.analyzer.analyze();
        session.gate?.observe(metrics);
        setSpeech(metrics.voiced);
      }, 100);
      setActive(true);
    } catch (err) {
      session.controller.abort();
      stopCapture(session);
      if (current.current === session)
        setError(err instanceof Error ? err.message : "Microphone unavailable.");
    } finally {
      if (current.current === session) setStarting(false);
    }
  }

  function stop() {
    const session = current.current;
    if (session) {
      if (session.recorder && session.recorder.state !== "inactive") {
        session.stopping = true;
        setBusy(true);
      }
      stopCapture(session);
    }
    setActive(false);
    setStarting(false);
    setSpeech(false);
  }

  useEffect(() => () => {
    const session = current.current;
    current.current = null;
    if (!session) return;
    session.controller.abort();
    session.pending = undefined;
    stopCapture(session);
    if (session.jobId) void session.client.cancel(session.jobId).catch(() => {});
  }, []);

  return { active, starting, busy, job, error, speech, start, stop };
}
