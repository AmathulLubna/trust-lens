import { useEffect, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { VoiceAnalyzer, type VoiceMetrics } from "@/lib/voice-analysis";
import { SerialQueue } from "@/lib/serial-queue";
import { SpeechGate } from "@/lib/speech-gate";
import {
  behaviorFromFlags,
  calibrateVerdict,
  scamFlagsFromText,
  type TranscriptLine,
  type Verdict,
} from "@/lib/trustlens";
import { VERDICT_RANK } from "@/lib/numbers";
import { toast } from "sonner";

type AiResult =
  | {
      ok: true;
      verdict: Verdict;
      confidence: number;
      summary: string;
      markers: string[];
    }
  | { ok: false; message: string };
type Session = {
  id: string;
  startedAt: number;
  lines: TranscriptLine[];
  metrics: VoiceMetrics | null;
  result: AiResult | null;
  queue: SerialQueue;
  ai: Promise<void> | null;
  canceled: boolean;
  ending: boolean;
  analyzedLineCount: number;
  language: string;
  failedSegments: Map<Blob, string>;
};

export function useLiveVoice() {
  const [micOn, setMicOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<VoiceMetrics | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [finalVerdict, setFinalVerdict] = useState<Verdict | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [pendingSegments, setPendingSegments] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [language, setLanguage] = useState<"auto" | "en" | "hi">("auto");
  const [saveTranscript, setSaveTranscript] = useState(false);
  const current = useRef<Session | null>(null);
  const analyzer = useRef<VoiceAnalyzer | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recorderStopped = useRef<Promise<void>>(Promise.resolve());
  const acquisition = useRef(0);
  const acquiring = useRef(false);
  const listening = useRef(false);
  const speechGate = useRef<SpeechGate | null>(null);
  const segmentTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const sampleTimer = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const runGroq = useAction(api.analyze.groqVerdict);
  const transcribe = useAction(api.analyze.groqTranscribe);
  const checkVoice = useAction(api.analyze.voiceStatus);
  const recordCall = useMutation(api.calls.record);

  async function runAi(session: Session, force = false) {
    if (session.canceled || session.lines.length === 0) return;
    if (session.ai) {
      await session.ai;
      if (session.canceled) return;
    }
    if (!force && session.lines.length === session.analyzedLineCount) return;
    session.analyzedLineCount = session.lines.length;
    const m = session.metrics;
    const lines = [...session.lines];
    setAiBusy(true);
    const task = (async () => {
      try {
        const result = (await runGroq({
          sessionId: session.id,
          voiceMetrics: m?.voiced
            ? {
                pitchHz: m.pitchHz ?? undefined,
                jitterPct: m.jitterPct,
                flatness: m.flatness,
                rolloff: m.rolloff,
                confidence: m.confidence,
              }
            : undefined,
          transcript: lines.map(({ speaker, text }) => ({ speaker, text })),
          flags: lines
            .flatMap((l) => scamFlagsFromText(l.text))
            .map(({ id, label, severity }) => ({ id, label, severity })),
          channel: "mic",
        })) as AiResult;
        if (!session.canceled) {
          session.result = result;
          setAiResult(result);
        }
      } catch {
        if (!session.canceled) {
          session.result = {
            ok: false,
            message: "The AI request failed. Try again.",
          };
          setAiResult(session.result);
        }
      } finally {
        if (!session.canceled) setAiBusy(false);
      }
    })();
    session.ai = task;
    await task;
    if (session.ai === task) session.ai = null;
  }

  function enqueueSegment(session: Session, blob: Blob, mime: string) {
    if (!blob.size || session.canceled) return;
    setPendingSegments((n) => n + 1);
    void session.queue
      .enqueue(async () => {
        if (session.canceled) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000)
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const result = await transcribe({
          audioBase64: btoa(binary),
          mimeType: mime,
          filename: `segment.${mime.includes("mp4") ? "m4a" : "webm"}`,
          language: session.language,
        });
        if (session.canceled) return;
        if (result.ok || result.message === "No speech detected.") {
          session.failedSegments.delete(blob);
        }
        if (result.ok && result.text?.trim()) {
          session.lines.push({
            speaker: "caller",
            text: result.text.trim(),
            t: (Date.now() - session.startedAt) / 1000,
          });
          setTranscript([...session.lines]);
          if (!session.ending) void runAi(session);
        } else if (!result.ok && result.message !== "No speech detected.") {
          throw new Error(result.message ?? "Transcription failed.");
        }
      })
      .catch((error) => {
        if (!session.canceled) {
          session.failedSegments.set(blob, mime);
          setMicError(
            error instanceof Error
              ? error.message
              : "A segment could not be transcribed.",
          );
          void pauseMic();
        }
      })
      .finally(() => {
        if (!session.canceled) setPendingSegments((n) => n - 1);
      });
  }

  function startSegment(session: Session, stream: MediaStream) {
    if (!listening.current || session.canceled || session.ending) return;
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
      (type) => MediaRecorder.isTypeSupported(type),
    );
    const next = new MediaRecorder(
      stream,
      mime ? { mimeType: mime } : undefined,
    );
    const chunks: Blob[] = [];
    const gate = new SpeechGate();
    speechGate.current = gate;
    recorder.current = next;
    let resolveStopped!: () => void;
    recorderStopped.current = new Promise((resolve) => {
      resolveStopped = resolve;
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      next.onstop = () => {
        clearTimeout(segmentTimer.current);
        const type = chunks[0]?.type || mime || "audio/webm";
        if (gate.hasSpeech) enqueueSegment(session, new Blob(chunks, { type }), type);
        resolve();
        if (listening.current && !session.canceled && !session.ending) {
          try {
            startSegment(session, stream);
          } catch {
            setMicError("Recording stopped unexpectedly. Please resume.");
            void pauseMic();
          }
        }
      };
      next.onerror = () => {
        setMicError("Audio recording failed. Resume the microphone to try again.");
        resolve();
        void pauseMic();
      };
    });
    try {
      next.start();
    } catch (error) {
      resolveStopped();
      throw error;
    }
    segmentTimer.current = setTimeout(() => {
      if (next.state !== "inactive") next.stop();
    }, 6000);
  }

  async function startMic() {
    if (
      listening.current ||
      acquiring.current ||
      (current.current?.ending && !current.current.canceled)
    )
      return;
    acquiring.current = true;
    setStarting(true);
    setMicError(null);
    const ticket = ++acquisition.current;
    await recorderStopped.current;
    if (ticket !== acquisition.current) return;
    try {
      const status = await checkVoice({});
      if (ticket !== acquisition.current) return;
      if (!status.ready) throw new Error(status.message);
      if (!window.isSecureContext) {
        throw new Error("Microphone access needs HTTPS or localhost. Open TrustLens using a secure address.");
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("This browser cannot record microphone audio. Try a current version of Chrome, Edge, Firefox, or Safari.");
      }
    } catch (error) {
      if (ticket === acquisition.current) {
        acquiring.current = false;
        setStarting(false);
        setMicError(error instanceof Error ? error.message : "Could not connect to hosted voice analysis. Retry shortly.");
      }
      return;
    }
    let session = current.current;
    if (!session || session.canceled) {
      session = {
        id: crypto.randomUUID(),
        startedAt: Date.now(),
        lines: [],
        metrics: null,
        result: null,
        queue: new SerialQueue(),
        ai: null,
        canceled: false,
        ending: false,
        analyzedLineCount: -1,
        language,
        failedSegments: new Map(),
      };
      current.current = session;
      setTranscript([]);
      setAiResult(null);
      setFinalVerdict(null);
      setSaved(false);
      setPendingSegments(0);
      setMetrics(null);
    }
    const active = session;
    const nextAnalyzer = new VoiceAnalyzer();
    try {
      const stream = await nextAnalyzer.start();
      if (ticket !== acquisition.current || active.canceled || active.ending) {
        nextAnalyzer.stop();
        return;
      }
      analyzer.current = nextAnalyzer;
      listening.current = true;
      startSegment(active, stream);
      setMicOn(true);
      setSessionActive(true);
      sampleTimer.current = setInterval(() => {
        const snapshot = nextAnalyzer.analyze();
        speechGate.current?.observe(snapshot);
        if (snapshot.voiced) active.metrics = snapshot;
        setMetrics(snapshot);
      }, 100);
    } catch {
      nextAnalyzer.stop();
      listening.current = false;
      clearTimeout(segmentTimer.current);
      clearInterval(sampleTimer.current);
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
      analyzer.current = null;
      setMicOn(false);
      setMicError(
        "Microphone unavailable. Allow microphone access and try again.",
      );
    } finally {
      if (ticket === acquisition.current) {
        acquiring.current = false;
        setStarting(false);
      }
    }
  }

  async function pauseMic() {
    acquisition.current += 1;
    acquiring.current = false;
    listening.current = false;
    clearTimeout(segmentTimer.current);
    clearInterval(sampleTimer.current);
    if (recorder.current?.state !== "inactive") recorder.current?.stop();
    analyzer.current?.stop();
    analyzer.current = null;
    setStarting(false);
    setMicOn(false);
    setMetrics(null);
    await recorderStopped.current;
  }

  async function endSession() {
    const session = current.current;
    if (!session || session.ending) return;
    session.ending = true;
    setEnding(true);
    setSaving(true);
    const durationSec = Math.max(
      1,
      Math.round((Date.now() - session.startedAt) / 1000),
    );
    try {
      await pauseMic();
      await session.queue.drain();
      if (session.canceled) return;
      // Retry incomplete chunks before deciding or archiving the session.
      for (const [blob, mime] of session.failedSegments) {
        enqueueSegment(session, blob, mime);
      }
      await session.queue.drain();
      if (session.canceled) return;
      if (session.failedSegments.size > 0) {
        session.ending = false;
        setMicError("Some audio could not be transcribed. Press End Check to retry before saving a result.");
        return;
      }
      if (session.lines.length === 0) {
        session.ending = false;
        setMicError(
          "No clear speech was captured. Resume the microphone and try again.",
        );
        return;
      }
      await runAi(session, true);
      if (session.canceled) return;
      if (!session.result?.ok) {
        session.ending = false;
        setMicError(session.result?.message ?? "The hosted analysis is incomplete. Press End Check to retry.");
        return;
      }
      setMicError(null);
      const flags = session.lines.flatMap((l) => scamFlagsFromText(l.text));
      const m = session.metrics;
      const local = calibrateVerdict(
        m && m.confidence >= 88
          ? "flagged"
          : m && m.confidence >= 65
            ? "suspicious"
            : "safe",
        flags,
        session.lines,
        m ?? undefined,
      );
      const ai = session.result?.ok ? session.result.verdict : null;
      const behavior = flags.length
        ? calibrateVerdict("flagged", flags, session.lines)
        : "safe";
      const verdict = [local, behavior, ...(ai ? [ai] : [])].reduce((a, b) =>
        VERDICT_RANK[a] >= VERDICT_RANK[b] ? a : b,
      );
      setFinalVerdict(verdict);
      await recordCall({
        sessionId: session.id,
        archiveTranscript: saveTranscript,
        callerName: "Live mic check",
        channel: "unknown",
        startedAt: session.startedAt,
        durationSec,
        verdict,
        riskScore:
          verdict === "flagged" ? 85 : verdict === "suspicious" ? 55 : 15,
        voiceScore: m?.confidence,
        behaviorScore: behaviorFromFlags(flags),
        flags,
        transcript: saveTranscript ? session.lines : undefined,
      });
      if (!session.canceled) {
        setSaved(true);
        toast.success("Session archived to your ledger");
        setSessionActive(false);
        session.canceled = true;
        current.current = null;
      }
    } catch {
      if (!session.canceled) {
        setMicError(
          "Could not archive this session. Press End Check to retry.",
        );
        session.ending = false;
      }
    } finally {
      setEnding(false);
      setSaving(false);
    }
  }

  useEffect(
    () => () => {
      if (current.current) current.current.canceled = true;
      acquisition.current += 1;
      listening.current = false;
      clearTimeout(segmentTimer.current);
      clearInterval(sampleTimer.current);
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
      analyzer.current?.stop();
    },
    [],
  );

  return {
    micOn,
    starting,
    ending,
    micError,
    metrics,
    transcript,
    aiResult,
    finalVerdict,
    aiBusy,
    transcribing: pendingSegments > 0,
    saving,
    saved,
    sessionActive,
    language,
    setLanguage,
    saveTranscript,
    setSaveTranscript,
    startMic,
    pauseMic,
    endSession,
    runAiVerdict: () => {
      if (current.current && !current.current.ending)
        void runAi(current.current, true);
    },
  };
}
