import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArchCard, ScoreMeter, VerdictStamp } from "@/components/dashboard/shared";
import { api } from "@/convex/_generated/api";
import { VoiceAnalyzer, type VoiceMetrics } from "@/lib/voice-analysis";
import { VERDICT_RANK } from "@/lib/numbers";
import {
  behaviorFromFlags,
  calibrateVerdict,
  riskFrom,
  scamFlagsFromText,
  SCENARIO,
  SCENARIO_END_S,
  verdictFromRisk,
  voiceRamp,
  type Channel,
  type ScamFlag,
  type TranscriptLine,
  type Verdict,
} from "@/lib/trustlens";
import { cn } from "@/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  AudioLines,
  Brain,
  Check,
  Eye,
  Loader2,
  Mic,
  MicOff,
  MessageCircle,
  Phone,
  PhoneOff,
  Radio,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  Timer,
  Vibrate,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Phase = "setup" | "ringing" | "active" | "ended";
type Mode = "scenario" | "mic";

const CALLER = { name: "Amma (Mother)", number: "+91 98••••••21" };
const BAR_HEIGHTS = [0.35, 0.7, 0.5, 0.9, 0.4, 0.75, 0.3, 0.85, 0.6, 0.45, 0.8, 0.55, 0.95, 0.42, 0.68, 0.5, 0.88, 0.36, 0.72, 0.58];

export default function LiveGuard() {
  const [mode, setMode] = useState<Mode>("scenario");
  const [phase, setPhase] = useState<Phase>("setup");
  const [channel, setChannel] = useState<Channel>("phone");
  const [saveTranscript, setSaveTranscript] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [shownLines, setShownLines] = useState<TranscriptLine[]>([]);
  const [revealedFlags, setRevealedFlags] = useState<ScamFlag[]>([]);
  const [flaggedAt, setFlaggedAt] = useState<number | null>(null);
  const [seed] = useState(() => Math.random() * 100);
  const [notified, setNotified] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const settings = useQuery(api.settings.get);
  const circle = useQuery(api.circle.list);
  const recordCall = useMutation(api.calls.record);

  const voiceScore = useMemo(() => voiceRamp(elapsed, seed), [elapsed, seed]);
  const behaviorScore = useMemo(() => behaviorFromFlags(revealedFlags), [revealedFlags]);
  const risk = useMemo(() => riskFrom(voiceScore, behaviorScore), [voiceScore, behaviorScore]);
  const verdict = useMemo(() => verdictFromRisk(risk), [risk]);

  /* Tick clock while the call is active. */
  useEffect(() => {
    if (phase !== "active") return;
    const start = Date.now();
    const timer = window.setInterval(() => {
      setElapsed((Date.now() - start) / 1000);
    }, 100);
    return () => window.clearInterval(timer);
  }, [phase]);

  /* Reveal transcript lines + flags as the conversation progresses. */
  useEffect(() => {
    if (phase !== "active") return;
    for (const line of SCENARIO) {
      if (elapsed >= line.t) {
        setShownLines((prev) =>
          prev.some((l) => l.t === line.t)
            ? prev
            : [...prev, { speaker: line.speaker, text: line.text, t: line.t }],
        );
        if (line.flag) {
          setRevealedFlags((prev) =>
            prev.some((f) => f.id === line.flag!.id) ? prev : [...prev, line.flag!],
          );
        }
      }
    }
  }, [elapsed, phase]);

  /* Auto-end when the script finishes. */
  useEffect(() => {
    if (phase === "active" && elapsed >= SCENARIO_END_S) {
      setPhase("ended");
    }
  }, [elapsed, phase]);

  /* Intervention: banner + vibration the moment the verdict is "flagged". */
  useEffect(() => {
    if (phase === "active" && verdict === "flagged" && flaggedAt === null) {
      setFlaggedAt(elapsed);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([120, 60, 120, 60, 240]);
      }
    }
  }, [phase, verdict, flaggedAt, elapsed]);

  /* Persist the call to the ledger once it ends. */
  useEffect(() => {
    if (phase !== "ended" || saving) return;
    setSaving(true);
    const willNotify = (settings?.autoNotifyCircle ?? true) && verdict === "flagged";
    const firstMember = circle?.[0]?.name;
    if (willNotify && firstMember) setNotified(firstMember);
    void (async () => {
      try {
        await recordCall({
          callerName: CALLER.name,
          callerNumber: CALLER.number,
          channel,
          startedAt: Date.now() - elapsed * 1000,
          durationSec: Math.round(elapsed),
          verdict,
          riskScore: risk,
          voiceScore,
          behaviorScore,
          flags: revealedFlags,
          transcript: saveTranscript ? shownLines : undefined,
          notifiedCircle: willNotify,
        });
        toast.success("Call archived to your ledger");
      } catch (err) {
        console.error("Failed to record call", err);
        toast.error("Could not archive the call");
      } finally {
        setSaving(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function reset() {
    setPhase("setup");
    setElapsed(0);
    setShownLines([]);
    setRevealedFlags([]);
    setFlaggedAt(null);
    setNotified(null);
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="arch-label text-primary">Live guard · test bench</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
            Test the pipeline with a sample call
          </h2>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            type="button"
            variant={mode === "scenario" ? "default" : "outline"}
            className="flex-1 sm:flex-none"
            onClick={() => {
              setMode("scenario");
              reset();
            }}
          >
            <Phone className="size-4" /> Scenario call
          </Button>
          <Button
            type="button"
            variant={mode === "mic" ? "default" : "outline"}
            className="flex-1 sm:flex-none"
            onClick={() => {
              setMode("mic");
              reset();
            }}
          >
            <Mic className="size-4" /> Live voice check
          </Button>
        </div>
      </div>

      {mode === "scenario" ? (
        <ScenarioPanel
          phase={phase}
          channel={channel}
          setChannel={setChannel}
          saveTranscript={saveTranscript}
          setSaveTranscript={setSaveTranscript}
          onAnswer={() => setPhase("active")}
          onEnd={() => setPhase("ended")}
          onReset={reset}
          elapsed={elapsed}
          voiceScore={voiceScore}
          behaviorScore={behaviorScore}
          risk={risk}
          verdict={verdict}
          flaggedAt={flaggedAt}
          shownLines={shownLines}
          revealedFlags={revealedFlags}
          notified={notified}
          saving={saving}
        />
      ) : (
        <MicPanel />
      )}
    </div>
  );
}

/* ─────────────────────────── Scenario ─────────────────────────── */

function ScenarioPanel(props: {
  phase: Phase;
  channel: Channel;
  setChannel: (c: Channel) => void;
  saveTranscript: boolean;
  setSaveTranscript: (b: boolean) => void;
  onAnswer: () => void;
  onEnd: () => void;
  onReset: () => void;
  elapsed: number;
  voiceScore: number;
  behaviorScore: number;
  risk: number;
  verdict: "safe" | "suspicious" | "flagged";
  flaggedAt: number | null;
  shownLines: TranscriptLine[];
  revealedFlags: ScamFlag[];
  notified: string | null;
  saving: boolean;
}) {
  const {
    phase, channel, setChannel, saveTranscript, setSaveTranscript,
    onAnswer, onEnd, onReset, elapsed, voiceScore, behaviorScore, risk,
    verdict, flaggedAt, shownLines, revealedFlags, notified, saving,
  } = props;

  if (phase === "setup") {
    return (
      <ArchCard label="Scenario call · briefing" className="mx-auto max-w-2xl">
        <div className="space-y-5 p-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Trust Lens will receive an inbound call from{" "}
            <strong className="text-foreground">{CALLER.name}</strong> (
            {CALLER.number}), an unknown number that <em>claims</em> to be a
            close relative — the classic voice-clone scam script. Watch both
            agents work in parallel, and see when — and how — the guard
            intervenes.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            {(
              [
                ["phone", "Phone call", Phone],
                ["whatsapp", "WhatsApp voice", MessageCircle],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setChannel(value)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                  channel === value
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
            <Switch
              checked={saveTranscript}
              onCheckedChange={setSaveTranscript}
              aria-label="Save transcript"
            />
            <span className="text-sm leading-snug text-muted-foreground">
              <span className="font-medium text-foreground">
                Archive the transcript
              </span>
              <br />
              Privacy first: off by default. Scores and verdict always save;
              the verbatim transcript only when you opt in.
            </span>
          </label>
          <Button type="button" size="lg" className="w-full gap-2" onClick={onAnswer}>
            <Phone className="size-5" />
            Simulate the incoming call
          </Button>
        </div>
      </ArchCard>
    );
  }

  if (phase === "ringing") {
    return (
      <ArchCard label="Inbound call · screening armed" className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
          <div className="relative">
            <motion.div
              className="size-24 rounded-full border-2 border-primary/40"
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Eye className="size-9 text-primary" />
            </div>
          </div>
          <div>
            <p className="font-display text-xl font-semibold">{CALLER.name}</p>
            <p className="font-mono text-sm text-muted-foreground">
              {CALLER.number} · {channel === "whatsapp" ? "WhatsApp voice call" : "Phone call"}
            </p>
          </div>
          <span className="arch-label flex items-center gap-2 text-primary">
            <Radio className="size-3.5 animate-pulse" />
            Listening for voice authenticity…
          </span>
          <div className="mt-2 flex items-center gap-3">
            <Button
              type="button"
              size="lg"
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={onAnswer}
            >
              <Phone className="size-5" />
              Answer
            </Button>
            <Button type="button" size="lg" variant="outline" className="gap-2" onClick={onReset}>
              <PhoneOff className="size-5" />
              Decline
            </Button>
          </div>
        </div>
      </ArchCard>
    );
  }

  return (
    <div className="space-y-5">
      {/* Intervention banner */}
      <AnimatePresenceIn flag={verdict === "flagged" && phase === "active"}>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="alert-pulse flex flex-col gap-3 rounded-2xl border-2 border-red-500 bg-red-50 px-5 py-4 dark:bg-red-500/10 sm:flex-row sm:items-center"
        >
          <ShieldAlert className="size-7 shrink-0 text-rose-600" />
          <div className="flex-1">
            <p className="font-display font-semibold text-red-700">
              Possible voice clone + urgency scam pattern detected
            </p>
            <p className="text-sm text-red-700/80">
              Verify via a separate channel before acting — call the number you
              have saved for this person. Do not send money on this call.
            </p>
          </div>
          <Vibrate className="hidden size-6 text-red-500 sm:block" />
        </motion.div>
      </AnimatePresenceIn>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Call panel */}
        <div className="lg:col-span-2">
          <ArchCard
            label="The call"
            action={
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                <Timer className="mr-1 inline size-3" />
                {Math.floor(elapsed)}s
              </span>
            }
          >
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
                  A
                </span>
                <div>
                  <p className="font-semibold">{CALLER.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {CALLER.number} · {channel}
                  </p>
                </div>
                <span className="ml-auto arch-label flex items-center gap-1.5 text-primary">
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                  Live
                </span>
              </div>

              {/* waveform */}
              <div className="flex h-16 items-center justify-center gap-1 rounded-xl bg-slate-950 px-3">
                {BAR_HEIGHTS.map((h, i) => (
                  <motion.span
                    key={i}
                    className="w-1.5 rounded-full bg-blue-400/80"
                    animate={{ scaleY: [0.35, h, 0.45, h, 0.35] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.1 + (i % 5) * 0.18,
                      ease: "easeInOut",
                      delay: (i % 7) * 0.07,
                    }}
                  />
                ))}
              </div>

              {phase === "active" ? (
                <>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
                    <ScoreMeter
                      label="Combined risk"
                      value={risk}
                      className="max-w-[180px]"
                    />
                    <VerdictStamp verdict={verdict} />
                  </div>
                  {flaggedAt !== null && phase === "active" && (
                    <p className="arch-label flex items-center gap-2 text-red-600">
                      <Vibrate className="size-3.5" />
                      Intervention at t+{flaggedAt.toFixed(1)}s
                    </p>
                  )}
                  <Button type="button" variant="outline" className="w-full gap-2" onClick={onEnd}>
                    <PhoneOff className="size-4" />
                    End call
                  </Button>
                </>
              ) : (
                <VerdictSummary
                  verdict={verdict}
                  risk={risk}
                  flags={revealedFlags}
                  transcript={shownLines}
                  notified={notified}
                  saving={saving}
                  onReset={onReset}
                />
              )}
            </div>
          </ArchCard>
        </div>

        {/* Agents */}
        <div className="space-y-5 lg:col-span-3">
          {/* Voice agent */}
          <ArchCard
            label="Agent I · voice authenticity"
            action={
              <span className="arch-label text-primary">
                {verdict === "flagged" ? "Synthetic" : "Listening"}
              </span>
            }
          >
            <div className="space-y-4 p-5">
              <div className="flex items-end justify-between gap-6">
                <ScoreMeter label="Synthetic-voice confidence" value={voiceScore} />
                <span className="numeral hidden text-4xl font-bold text-primary sm:block">
                  {voiceScore}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  ["Pitch jitter", "1.1%", "below human 3–8%"],
                  ["Prosody flatness", "0.82", "abnormally steady"],
                  ["Spectral artifacts", "0.74", "vocoder signature"],
                ].map(([k, v, note]) => (
                  <div key={k} className="rounded-xl border border-border bg-muted/40 px-2 py-3">
                    <p className="arch-label text-muted-foreground">{k}</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-red-600">{v}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-dashed border-sky-300 bg-sky-50/60 p-3 text-xs leading-relaxed text-muted-foreground dark:border-sky-500/40 dark:bg-sky-500/10">
                <AudioLines className="mt-0.5 size-4 shrink-0 text-sky-600" />
                Edge features computed on-device; borderline cases are relayed
                to a hosted classifier for a second opinion in &lt;2s.
              </div>
            </div>
          </ArchCard>

          {/* Behavior agent */}
          <ArchCard
            label="Agent II · scam patterns"
            action={
              <span className="arch-label text-sky-600">
                {revealedFlags.length} markers
              </span>
            }
          >
            <div className="grid gap-5 p-5 sm:grid-cols-2">
              <div>
                <ScoreMeter label="Social-engineering risk" value={behaviorScore} />
                <ul className="mt-4 space-y-2">
                  {revealedFlags.length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      No markers yet — watching the conversation…
                    </li>
                  )}
                  {revealedFlags.map((f) => (
                    <motion.li
                      key={f.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-2 text-sm"
                    >
                      <ScanLine
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          f.severity === "critical"
                            ? "text-red-600"
                            : "text-amber-600",
                        )}
                      />
                      <span className="leading-snug">{f.label}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
              {/* transcript */}
              <div className="max-h-[260px] overflow-y-auto rounded-xl border border-border bg-muted/40 p-3">
                <p className="arch-label mb-3 text-muted-foreground">
                  Live transcript
                </p>
                <div className="space-y-2.5">
                  {shownLines.length === 0 && (
                    <p className="text-sm italic text-muted-foreground">
                      (silence — awaiting speech)
                    </p>
                  )}
                  {shownLines.map((l) => (
                    <p
                      key={l.t}
                      className={cn(
                        "text-sm leading-snug",
                        l.speaker === "caller" ? "text-foreground" : "text-muted-foreground italic",
                      )}
                    >
                      <span className="mr-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {l.speaker === "caller" ? "Caller" : "You"}
                      </span>
                      “{l.text}”
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </ArchCard>
        </div>
      </div>
    </div>
  );
}

function VerdictSummary(props: {
  verdict: "safe" | "suspicious" | "flagged";
  risk: number;
  flags: ScamFlag[];
  transcript: TranscriptLine[];
  notified: string | null;
  saving: boolean;
  onReset: () => void;
}) {
  const { verdict, risk, flags, transcript, notified, saving, onReset } = props;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="arch-label text-muted-foreground">Call concluded</p>
          <p className="mt-1 font-display text-lg font-semibold">
            {VERDICT_HEADLINE[verdict]}
          </p>
        </div>
        <VerdictStamp verdict={verdict} />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Final risk score</span>
        <span className="font-mono font-semibold tabular-nums">{risk}/100</span>
      </div>
      <GroqVerdict transcript={transcript} flags={flags} />
      {verdict === "flagged" && notified && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10">
          <Brain className="size-4" />
          Alert circle notified — {notified} has been alerted.
        </p>
      )}
      {verdict === "flagged" && !notified && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Add a circle member to auto-alert your team on flagged calls.
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="arch-label text-muted-foreground">
          {saving ? "Archiving…" : `${flags.length} markers logged`}
        </span>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onReset} disabled={saving}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Run again
        </Button>
      </div>
    </div>
  );
}

const VERDICT_HEADLINE: Record<"safe" | "suspicious" | "flagged", string> = {
  safe: "No deception detected",
  suspicious: "Some markers — review advised",
  flagged: "Scam attempt intercepted",
};

/* ─────────────────────────── Mic check ─────────────────────────── */

function MicPanel() {
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<VoiceMetrics | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [aiResult, setAiResult] = useState<AiVerdictResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);

  const recordCall = useMutation(api.calls.record);

  const analyzerRef = useRef<VoiceAnalyzer | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const micOnRef = useRef(false);
  const metricsRef = useRef<VoiceMetrics | null>(null);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const lastAiAtRef = useRef(0);
  const startedAtRef = useRef(0);
  const busyRef = useRef(false);
  // Transcription buffering: audio accumulates until the next flush, so
  // complete sentences (not chopped 3 s fragments) reach the scam-pattern
  // agent, and Whisper calls stay well inside Groq's rate limits.
  const pendingChunksRef = useRef<Blob[]>([]);
  const transcribingRef = useRef(false);
  const lastSendAtRef = useRef(0);
  const stoppingRef = useRef(false);

  const runGroq = useAction(api.analyze.groqVerdict);
  const transcribe = useAction(api.analyze.groqTranscribe);

  /* Cross-check the current features + transcript with Groq. Runs
   * automatically after each transcribed chunk and on a 5 s tick. */
  const runAiVerdict = useCallback(
    async (force: boolean) => {
      if (busyRef.current) return;
      const now = Date.now();
      if (!force && now - lastAiAtRef.current < 4000) return;
      lastAiAtRef.current = now;
      busyRef.current = true;
      setAiBusy(true);
      const m = metricsRef.current;
      const lines = transcriptRef.current;
      const flags = lines.flatMap((l) => scamFlagsFromText(l.text));
      try {
        const res = (await runGroq({
          voiceMetrics:
            m && m.voiced
              ? {
                  pitchHz: m.pitchHz ?? undefined,
                  jitterPct: m.jitterPct,
                  flatness: m.flatness,
                  rolloff: m.rolloff,
                  confidence: m.confidence,
                }
              : undefined,
          transcript: lines.map((l) => ({ speaker: l.speaker, text: l.text })),
          flags: flags.map((f) => ({ id: f.id, label: f.label, severity: f.severity })),
          channel: "mic",
        })) as AiVerdictResult;
        setAiResult(res);
      } catch {
        setAiResult({ ok: false, message: "The AI request failed — please try again." });
      } finally {
        busyRef.current = false;
        setAiBusy(false);
      }
    },
    [runGroq],
  );

  /* Transcribe the audio accumulated since the last flush via Groq Whisper
   * and feed the text back into the scam-pattern agent. Runs on a ~5 s
   * cadence while listening and once more when recording stops, so whole
   * sentences are heard rather than the first few 3 s fragments. */
  const flushTranscription = useCallback(
    async (final: boolean) => {
      const chunks = pendingChunksRef.current;
      if (chunks.length === 0 || transcribingRef.current) return;
      // Require at least ~6 s of buffered audio (6 x 1 s chunks) before a
      // non-final flush, so Whisper gets a whole sentence instead of a
      // single word. The final flush (on stop) always sends whatever is
      // left, however short, so the tail isn't lost.
      if (!final && chunks.length < 6) return;
      if (!final && Date.now() - lastSendAtRef.current < 5500) return;
      transcribingRef.current = true;
      setTranscribing(true);
      const mime = chunks[0].type || "audio/webm";
      const blob = new Blob(chunks, { type: mime });
      pendingChunksRef.current = [];
      try {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        const step = 0x8000;
        for (let i = 0; i < bytes.length; i += step) {
          bin += String.fromCharCode(...bytes.subarray(i, i + step));
        }
        const res = (await transcribe({
          audioBase64: btoa(bin),
          mimeType: mime,
        })) as { ok: boolean; text?: string; message?: string };
        lastSendAtRef.current = Date.now();
        if (res.ok && res.text?.trim()) {
          const line: TranscriptLine = {
            speaker: "caller",
            text: res.text.trim(),
            t: Math.round(((Date.now() - startedAtRef.current) / 1000) * 10) / 10,
          };
          transcriptRef.current = [...transcriptRef.current, line];
          setTranscript(transcriptRef.current);
          void runAiVerdict(true);
        }
      } catch {
        // A failed flush is non-fatal — the acoustics keep running and the
        // next cadence tick will pick up new audio.
      } finally {
        transcribingRef.current = false;
        setTranscribing(false);
      }
    },
    [transcribe, runAiVerdict],
  );

  /* Live acoustic feature loop.
   * Deliberately timer-driven, not requestAnimationFrame: rAF is fully
   * paused by the browser on a hidden/backgrounded tab, which would kill
   * voice screening the moment the phone screen locks or the user swaps
   * apps mid-call — exactly when this feature needs to keep working.
   * setInterval keeps running in the background (throttled, not stopped),
   * so the guard degrades gracefully instead of going silent. */
  useEffect(() => {
    if (!micOn) return;
    const analyzer = analyzerRef.current;
    if (!analyzer) return;
    const id = window.setInterval(() => {
      const m = analyzer.analyze();
      metricsRef.current = m;
      setMetrics(m);
    }, 50); // ~20 Hz — plenty for jitter/flatness, cheap enough to background
    return () => window.clearInterval(id);
  }, [micOn]);

  /* Periodic AI refresh while listening. */
  useEffect(() => {
    if (!micOn) return;
    const t = window.setInterval(() => void runAiVerdict(false), 5000);
    return () => window.clearInterval(t);
  }, [micOn, runAiVerdict]);

  /* Transcription cadence: flush the accumulated buffer ~every 5 s. */
  useEffect(() => {
    if (!micOn) return;
    const t = window.setInterval(() => void flushTranscription(false), 6000);
    return () => window.clearInterval(t);
  }, [micOn, flushTranscription]);

  /* Cleanup on unmount. */
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      recorderRef.current = null;
      analyzerRef.current?.stop();
      analyzerRef.current = null;
    };
  }, []);

  async function startMic() {
    setMicError(null);
    if (!sessionActive) {
      setSessionActive(true);
      setTranscript([]);
      transcriptRef.current = [];
      setAiResult(null);
      setSaved(false);
      lastAiAtRef.current = 0;
      lastSendAtRef.current = 0;
      startedAtRef.current = Date.now();
    }
    pendingChunksRef.current = [];
    stoppingRef.current = false;
    try {
      const analyzer = new VoiceAnalyzer();
      const stream = await analyzer.start();
      analyzerRef.current = analyzer;
      micOnRef.current = true;
      setMicOn(true);
      const mime = pickRecorderMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          pendingChunksRef.current.push(e.data);
          // Do NOT flush here on every 3 s chunk — that's what was cutting
          // sentences to one word. Only the stop()-triggered final flush
          // (stoppingRef.current) and the 5 s interval in the effect below
          // should call flushTranscription. Buffering multiple chunks lets
          // whole sentences accumulate before they're sent to Whisper.
          if (stoppingRef.current) void flushTranscription(true);
        }
      };
      // Smaller timeslice = smoother buffering, NOT more frequent sends.
      // Actual send cadence is controlled by the 5 s interval below plus
      // the 4.5 s gate inside flushTranscription.
      recorder.start(1000);
    } catch {
      micOnRef.current = false;
      setMicError(
        "Microphone unavailable — allow mic access, or use the scenario call to see the pipeline.",
      );
    }
  }

  function pauseMic() {
    micOnRef.current = false;
    stoppingRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    analyzerRef.current?.stop();
    analyzerRef.current = null;
    setMicOn(false);
    setMetrics(null);
    metricsRef.current = null;
    // Give MediaRecorder a beat to emit its final chunk, then transcribe
    // whatever is left so the tail of the sentence is not lost.
    window.setTimeout(() => void flushTranscription(true), 350);
  }

  function endSession() {
    pauseMic();
    setSessionActive(false);
  }

  const liveFlags = useMemo(
    () => transcript.flatMap((l) => scamFlagsFromText(l.text)),
    [transcript],
  );
  const confidence = metrics?.voiced ? metrics.confidence : 0;
  const rawLocalVerdict: Verdict = metrics?.voiced
    ? confidence >= 88
      ? "flagged"
      : confidence >= 65
        ? "suspicious"
        : "safe"
    : "safe";
  const localVerdict = calibrateVerdict(
    rawLocalVerdict,
    liveFlags,
    transcript,
    metrics
      ? {
          confidence: metrics.confidence,
          jitterPct: metrics.jitterPct,
          flatness: metrics.flatness,
          rolloff: metrics.rolloff,
        }
      : undefined,
  );
  const aiVerdict = aiResult && aiResult.ok ? aiResult.verdict : null;
  const combinedVerdict: Verdict =
    aiVerdict && VERDICT_RANK[aiVerdict] > VERDICT_RANK[localVerdict]
      ? aiVerdict
      : localVerdict;

  /* Persist the session to the ledger once the mic stops AND the final
   * transcription/AI verdict has settled — same pattern as the scripted
   * demo call. Waiting on aiBusy/transcribing avoids saving a stale
   * "safe" verdict a split second before the real one lands. */
  useEffect(() => {
    if (sessionActive || saved || saving) return;
    if (transcript.length === 0) return;
    if (transcribingRef.current || busyRef.current) return;
    setSaving(true);
    const verdict: Verdict = aiResult?.ok ? aiResult.verdict : "safe";
    const durationSec = startedAtRef.current
      ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      : 0;
    void (async () => {
      try {
        await recordCall({
          callerName: "Live mic check",
          callerNumber: undefined,
          channel: "unknown",
          startedAt: startedAtRef.current || Date.now(),
          durationSec,
          verdict,
          riskScore:
            verdict === "flagged" ? 85 : verdict === "suspicious" ? 55 : 15,
          voiceScore: metricsRef.current?.confidence,
          behaviorScore: behaviorFromFlags(liveFlags),
          flags: liveFlags,
          transcript,
          notifiedCircle: verdict === "flagged",
        });
        setSaved(true);
        toast.success("Session archived to your ledger");
      } catch (err) {
        console.error("Failed to record mic session", err);
        toast.error("Could not archive this session");
      } finally {
        setSaving(false);
      }
    })();
  }, [micOn, saved, saving, transcript, aiResult, liveFlags, recordCall]);

  return (
    <ArchCard
      label={
        micOn
          ? "Live voice check · dual engine (on-device + Groq)"
          : "Live voice check · your microphone"
      }
      className="mx-auto max-w-4xl"
      action={
        micOn && (
          <span className="arch-label flex items-center gap-1.5 text-primary">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            Listening
          </span>
        )
      }
    >
      <div className="flex flex-col items-center gap-6 p-6 sm:p-8">
        <div className="relative flex size-28 items-center justify-center">
          <span
            className={cn(
              "absolute inset-0 rounded-full border-2",
              micOn ? "border-primary/50" : "border-border",
            )}
          />
          <span
            className={cn(
              "radar-sweep absolute inset-2 rounded-full border border-dashed",
              micOn ? "border-primary/40" : "border-border/60",
            )}
          />
          <div
            className={cn(
              "flex size-16 items-center justify-center rounded-full border-2",
              micOn
                ? "border-primary bg-primary/10"
                : "border-border bg-muted",
            )}
          >
            <Mic className={cn("size-7", micOn ? "text-primary" : "text-muted-foreground")} />
          </div>
        </div>

        {!sessionActive ? (
          <div className="w-full text-center">
            {transcript.length > 0 && (
              <LastSessionSummary
                transcript={transcript}
                aiResult={aiResult}
                flags={liveFlags}
                saving={saving}
                saved={saved}
                onNew={() => {
                  setTranscript([]);
                  transcriptRef.current = [];
                  setAiResult(null);
                  setSaved(false);
                }}
              />
            )}
            <h3 className="font-display text-lg font-semibold">
              {micError ? "Microphone needed" : "Check a live call in real time"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
              {micError ??
                "Put the call on speaker and hold the phone near this mic (or speak directly into it). On-device acoustics score the voice in real time while Groq Whisper transcribes full sentences every few seconds — the scam-pattern agent reads the words as they're said, and the AI verdict updates automatically."}
            </p>
            {micError && <p className="mt-2 text-xs text-rose-600">{micError}</p>}
            <Button type="button" className="mt-5 gap-2" onClick={startMic}>
              <Mic className="size-4" />
              Start new session
            </Button>
          </div>
        ) : (
          <div className="w-full space-y-5">
            <div className="flex items-center justify-between">
              {micOn ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="size-2 animate-pulse rounded-full bg-primary" />
                  Analysing live audio…
                  {transcribing && (
                    <span className="arch-label flex items-center gap-1.5 text-sky-600">
                      <Loader2 className="size-3 animate-spin" />
                      transcribing
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  Paused — hold mic button to resume
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button 
                  type="button" 
                  variant={micOn ? "default" : "outline"} 
                  size="sm" 
                  className="gap-2 select-none"
                  onPointerDown={startMic}
                  onPointerUp={pauseMic}
                  onPointerLeave={pauseMic}
                  onPointerCancel={pauseMic}
                >
                  {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                  Hold to listen
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={endSession}>
                  End Check
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Pitch", metrics?.voiced && metrics.pitchHz ? `${metrics.pitchHz} Hz` : "—"],
                ["Jitter", metrics?.voiced ? `${metrics.jitterPct}%` : "—"],
                ["Prosody flatness", metrics?.voiced ? metrics.flatness.toFixed(2) : "—"],
                ["Spectral rolloff", metrics?.voiced ? metrics.rolloff.toFixed(2) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-border bg-muted/40 px-3 py-3 text-center">
                  <p className="arch-label text-muted-foreground">{k}</p>
                  <p className="mt-1 font-mono text-base font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <ScoreMeter
                  label="On-device synthetic confidence"
                  value={confidence}
                  className="max-w-[240px]"
                />
                <div className="flex items-center gap-2">
                  <span className="arch-label text-muted-foreground">Combined</span>
                  <VerdictStamp verdict={combinedVerdict} />
                </div>
              </div>
              {!metrics?.voiced && (
                <p className="mt-3 text-xs italic text-muted-foreground">
                  Waiting for a clear voiced signal…
                </p>
              )}
            </div>

            {/* Live transcript + markers */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="arch-label mb-3 flex items-center gap-2 text-muted-foreground">
                  <MessageCircle className="size-3.5" />
                  Live transcript · Groq Whisper
                  {transcribing && <Loader2 className="size-3 animate-spin text-sky-600" />}
                </p>
                <div className="max-h-[200px] space-y-2 overflow-y-auto">
                  {transcript.length === 0 && (
                    <p className="text-sm italic text-muted-foreground">
                      (awaiting speech — speak into the mic…)
                    </p>
                  )}
                  {transcript.map((l, i) => (
                    <p key={`${l.t}-${i}`} className="text-sm leading-snug">
                      <span className="mr-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                        Caller · t+{l.t.toFixed(1)}s
                      </span>
                      “{l.text}”
                    </p>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="arch-label mb-3 text-muted-foreground">
                  Scam markers · {liveFlags.length}
                </p>
                {liveFlags.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing suspicious in the words yet.
                  </p>
                ) : (
                  <ul className="max-h-[200px] space-y-2 overflow-y-auto">
                    {liveFlags.map((f) => (
                      <li key={f.id} className="flex items-start gap-2 text-sm">
                        <ScanLine
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            f.severity === "critical"
                              ? "text-red-600"
                              : "text-amber-600",
                          )}
                        />
                        <span className="leading-snug">{f.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Auto AI verdict */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                    <Brain className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">AI verdict · Groq</p>
                    <p className="text-[11px] text-muted-foreground">
                      Auto-refreshes as the conversation progresses
                    </p>
                  </div>
                </div>
                {aiBusy && (
                  <span className="arch-label flex items-center gap-1.5 text-sky-600">
                    <Loader2 className="size-3 animate-spin" />
                    analysing
                  </span>
                )}
                {!aiBusy && aiResult?.ok && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void runAiVerdict(true)}>
                    <RefreshCw className="size-3" />
                    Refresh
                  </Button>
                )}
              </div>
              {aiResult && !aiResult.ok && (
                <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                  {aiResult.message}
                </div>
              )}
              {aiResult && aiResult.ok && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <VerdictStamp verdict={aiResult.verdict} />
                    <span className="font-mono text-xs text-muted-foreground">
                      {aiResult.confidence}/100 confidence
                    </span>
                  </div>
                  <ScoreMeter
                    label="AI confidence"
                    value={aiResult.confidence}
                    className="max-w-[200px]"
                  />
                  {aiResult.summary && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {aiResult.summary}
                    </p>
                  )}
                  {aiResult.markers.length > 0 && (
                    <ul className="space-y-1.5">
                      {aiResult.markers.map((m, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <ScanLine className="mt-0.5 size-4 shrink-0 text-blue-600" />
                          <span className="leading-snug">{m}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {!aiResult && (
                <p className="mt-3 text-xs italic text-muted-foreground">
                  Waiting for enough audio before the first cross-check…
                </p>
              )}
            </div>

            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              Dual engine: acoustics run on-device; audio chunks are sent to
              Groq Whisper for transcription and never stored. A hosted LLM
              cross-checks features and content in real time.
            </p>
          </div>
        )}
      </div>
    </ArchCard>
  );
}

function LastSessionSummary({
  transcript,
  aiResult,
  flags,
  saving,
  saved,
  onNew,
}: {
  transcript: TranscriptLine[];
  aiResult: AiVerdictResult | null;
  flags: ScamFlag[];
  saving: boolean;
  saved: boolean;
  onNew: () => void;
}) {
  const verdict = aiResult?.ok ? aiResult.verdict : "safe";
  return (
    <div className="mx-auto mb-6 max-w-md space-y-3 rounded-2xl border border-border bg-card p-4 text-left">
      <div className="flex items-center justify-between">
        <p className="arch-label text-muted-foreground">Last session</p>
        <VerdictStamp verdict={verdict} />
      </div>
      <p className="text-sm text-muted-foreground">
        {transcript.length} line{transcript.length === 1 ? "" : "s"} transcribed ·{" "}
        {flags.length} scam marker{flags.length === 1 ? "" : "s"}
      </p>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {saving ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            Archiving to your ledger…
          </>
        ) : saved ? (
          <>
            <Check className="size-3 text-emerald-600" />
            Saved to your ledger
          </>
        ) : (
          "Not archived yet"
        )}
      </p>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onNew}>
        <RefreshCw className="size-3.5" />
        Start a new check
      </Button>
    </div>
  );
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

/* ─────────────────────────── Groq AI verdict ─────────────────────────── */

type AiVerdictResult =
  | {
      ok: true;
      verdict: "safe" | "suspicious" | "flagged";
      confidence: number;
      summary: string;
      markers: string[];
    }
  | { ok: false; message: string };

/** Cross-checks the acoustic features + conversation content with Groq and
 *  shows the model's plain-language verdict. Gracefully explains when the
 *  GROQ_API_KEY is not configured yet. */
function GroqVerdict({
  voiceMetrics,
  transcript,
  flags,
}: {
  voiceMetrics?: VoiceMetrics;
  transcript?: TranscriptLine[];
  flags?: ScamFlag[];
}) {
  const runGroq = useAction(api.analyze.groqVerdict);
  const [result, setResult] = useState<AiVerdictResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    setLoading(true);
    setResult(null);
    try {
      const res = (await runGroq({
        voiceMetrics: voiceMetrics
          ? {
              pitchHz: voiceMetrics.pitchHz ?? undefined,
              jitterPct: voiceMetrics.jitterPct,
              flatness: voiceMetrics.flatness,
              rolloff: voiceMetrics.rolloff,
              confidence: voiceMetrics.confidence,
            }
          : undefined,
        transcript: transcript?.map((l) => ({
          speaker: l.speaker,
          text: l.text,
        })),
        flags: flags?.map((f) => ({
          id: f.id,
          label: f.label,
          severity: f.severity,
        })),
      })) as AiVerdictResult;
      setResult(res);
    } catch {
      setResult({
        ok: false,
        message: "The AI request failed — please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <Brain className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">AI verdict · Groq</p>
            <p className="text-[11px] text-muted-foreground">
              LLM cross-check of voice features and content
            </p>
          </div>
        </div>
        {!result && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={ask}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Brain className="size-3.5" />
            )}
            {loading ? "Analyzing…" : "Ask Groq"}
          </Button>
        )}
        {result && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={ask}
            disabled={loading}
          >
            <RefreshCw className="size-3" />
            Re-run
          </Button>
        )}
      </div>

      {loading && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Sending features and transcript to Groq…
        </p>
      )}

      {result && !result.ok && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {result.message}
        </div>
      )}

      {result && result.ok && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <VerdictStamp verdict={result.verdict} />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">
                {result.confidence}
              </span>
              /100 confidence
            </div>
          </div>
          <ScoreMeter
            label="AI confidence"
            value={result.confidence}
            className="max-w-[200px]"
          />
          {result.summary && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {result.summary}
            </p>
          )}
          {result.markers.length > 0 && (
            <ul className="space-y-1.5">
              {result.markers.map((m, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <ScanLine className="mt-0.5 size-4 shrink-0 text-blue-600" />
                  <span className="leading-snug">{m}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AnimatePresenceIn({ flag, children }: { flag: boolean; children: React.ReactNode }) {
  if (!flag) return null;
  return <>{children}</>;
}
