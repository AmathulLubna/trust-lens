import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArchCard, ScoreMeter, VerdictStamp } from "@/components/dashboard/shared";
import { api } from "@/convex/_generated/api";
import { type VoiceMetrics } from "@/lib/voice-analysis";
import { useLiveVoice } from "@/hooks/use-live-voice";
import HostedVoiceCheck from "../../../tl_model_lcu/frontend/HostedVoiceCheck";
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
  type ScamFlag,
  type TranscriptLine,
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
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Phase = "setup" | "ringing" | "active" | "ended";
type Mode = "scenario" | "mic";

const CALLER = { name: "Amma (Mother)", number: "+91 98••••••21" };
const BAR_HEIGHTS = [0.35, 0.7, 0.5, 0.9, 0.4, 0.75, 0.3, 0.85, 0.6, 0.45, 0.8, 0.55, 0.95, 0.42, 0.68, 0.5, 0.88, 0.36, 0.72, 0.58];

export default function LiveGuard() {
  const [mode, setMode] = useState<Mode>("mic");
  const [engine, setEngine] = useState<"cloud" | "local">("cloud");
  const [phase, setPhase] = useState<Phase>("setup");
  const [saveTranscript, setSaveTranscript] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const shownLines: TranscriptLine[] = SCENARIO.filter(line => elapsed >= line.t).map(({ speaker, text, t }) => ({ speaker, text, t }));
  const revealedFlags = SCENARIO.filter(line => elapsed >= line.t).flatMap(line => line.flag ? [line.flag] : []);
  const [flaggedAt, setFlaggedAt] = useState<number | null>(null);
  const [seed] = useState(() => Math.random() * 100);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [archiveFinished, setArchiveFinished] = useState(false);
  const [archiveFailed, setArchiveFailed] = useState(false);
  const [archiveRetry, setArchiveRetry] = useState(0);
  const archiveAttempt = useRef<string | null>(null);
  const startedAt = useRef(0);
  const logs = useQuery(api.calls.list);
  const notified = logs?.find(log => log.sessionId === sessionId)?.notifiedCircle ? "Your circle" : null;
  const saving = phase === "ended" && !archiveFinished;
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
      const next = Math.min(SCENARIO_END_S, (Date.now() - start) / 1000);
      setElapsed(next);
      const flags = SCENARIO.filter(line => next >= line.t).flatMap(line => line.flag ? [line.flag] : []);
      if (verdictFromRisk(riskFrom(voiceRamp(next, seed), behaviorFromFlags(flags))) === "flagged") {
        setFlaggedAt(previous => previous ?? next);
      }
      if (next >= SCENARIO_END_S) setPhase("ended");
    }, 100);
    return () => window.clearInterval(timer);
  }, [phase, seed]);

  /* Intervention: banner + vibration the moment the verdict is "flagged". */
  useEffect(() => {
    if (phase === "active" && flaggedAt !== null) {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([120, 60, 120, 60, 240]);
      }
    }
  }, [phase, flaggedAt]);

  /* Persist the call to the ledger once it ends. */
  useEffect(() => {
    const attempt = `${sessionId}:${archiveRetry}`;
    if (phase !== "ended" || archiveAttempt.current === attempt) return;
    archiveAttempt.current = attempt;
    void (async () => {
      try {
        await recordCall({
          sessionId,
          archiveTranscript: saveTranscript,
          callerName: CALLER.name,
          callerNumber: CALLER.number,
          channel: "phone",
          startedAt: startedAt.current,
          durationSec: Math.round(elapsed),
          verdict,
          riskScore: risk,
          voiceScore,
          behaviorScore,
          flags: revealedFlags,
          transcript: saveTranscript ? shownLines : undefined,
        });
        toast.success("Call archived to your ledger");
      } catch (err) {
        console.error("Failed to record call", err);
        toast.error("Could not archive the call");
        if (archiveAttempt.current === attempt) setArchiveFailed(true);
      } finally {
        if (archiveAttempt.current === attempt) setArchiveFinished(true);
      }
    })();
  }, [phase, sessionId, archiveRetry, elapsed, verdict, risk, voiceScore, behaviorScore, revealedFlags, shownLines, saveTranscript, recordCall]);

  function reset() {
    setPhase("setup");
    setElapsed(0);
    setFlaggedAt(null);
    setSessionId(crypto.randomUUID());
    setArchiveFinished(false);
    setArchiveFailed(false);
    setArchiveRetry(0);
    archiveAttempt.current = null;
    startedAt.current = 0;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="arch-label text-primary">Live guard · {engine === "local" && mode === "mic" ? "shared model" : "hosted analysis"}</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
            Check a live voice call
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

      {mode === "mic" && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <label htmlFor="live-engine" className="mr-3 text-sm font-medium">Live check mode</label>
          <select id="live-engine" value={engine} onChange={event => setEngine(event.target.value as "cloud" | "local")}
            className="rounded-lg border border-input bg-background p-2 text-sm">
            <option value="cloud">Cloud · transcript & scam check</option>
            <option value="local">VoiceSentinel · shared AI voice check</option>
          </select>
          <p className="text-xs text-muted-foreground">VoiceSentinel sends speech samples to the operator’s shared detector without a pairing key. Cloud checks transcripts for scam patterns. Switching modes stops the current check.</p>
        </div>
      )}
      {mode === "scenario" && archiveFailed && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm">The call result could not be saved. Retry to archive this same call.</p>
          <Button type="button" disabled={saving} onClick={() => {
            setArchiveFailed(false);
            setArchiveFinished(false);
            setArchiveRetry(retry => retry + 1);
          }}>
            Retry saving call
          </Button>
        </div>
      )}

      {mode === "scenario" ? (
        <ScenarioPanel
          phase={phase}
          saveTranscript={saveTranscript}
          setSaveTranscript={setSaveTranscript}
          onAnswer={() => {
            startedAt.current = Date.now();
            setPhase("active");
          }}
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
      ) : engine === "local" ? (
        <HostedVoiceCheck embedded ledgerEnabled live />
      ) : (
        <MicPanel />
      )}
    </div>
  );
}

/* ─────────────────────────── Scenario ─────────────────────────── */

function ScenarioPanel(props: {
  phase: Phase;
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
    phase, saveTranscript, setSaveTranscript,
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
              {CALLER.number} · Phone call
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
                    {CALLER.number} · Phone call
                  </p>
                </div>
                <span className="ml-auto arch-label flex items-center gap-1.5 text-primary">
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                  Live
                </span>
              </div>

              {/* waveform */}
              <div className="flex h-16 items-center justify-center gap-1 rounded-xl bg-[#0b0d12] px-3">
                {BAR_HEIGHTS.map((h, i) => (
                  <motion.span
                    key={i}
                    className="w-1.5 rounded-full bg-[#4ce0d2]/80"
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
          Alert email accepted for at least one enabled circle contact.
        </p>
      )}
      {verdict === "flagged" && !notified && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          No alert delivery confirmed yet. Check your notification setting and circle contacts.
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
  const {
    micOn, starting, ending, micError, metrics, transcript, aiResult, finalVerdict, aiBusy,
    transcribing, saving, saved, sessionActive, language, setLanguage,
    saveTranscript, setSaveTranscript, startMic, pauseMic, endSession, runAiVerdict,
  } = useLiveVoice();
  const liveFlags = useMemo(() => transcript.flatMap(l => scamFlagsFromText(l.text)), [transcript]);
  const confidence = metrics?.voiced ? metrics.confidence : 0;
  const localVerdict = calibrateVerdict(confidence >= 88 ? "flagged" : confidence >= 65 ? "suspicious" : "safe", liveFlags, transcript, metrics ?? undefined);
  const aiVerdict = aiResult?.ok ? aiResult.verdict : null;
  const combinedVerdict = aiVerdict && VERDICT_RANK[aiVerdict] > VERDICT_RANK[localVerdict] ? aiVerdict : localVerdict;

  return (
    <ArchCard
      label={
        micOn
          ? "Live voice check · browser audio + hosted Groq"
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
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={saveTranscript} onCheckedChange={setSaveTranscript} disabled={ending} aria-label="Archive the microphone transcript" />
          Archive the transcript (optional)
        </label>
        {ending && <p role="status" className="text-sm text-muted-foreground">Finishing queued audio and saving your result…</p>}
        {sessionActive && micError && <p role="alert" className="text-sm text-red-600">{micError}</p>}
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
            {finalVerdict !== null && (
              <LastSessionSummary
                verdict={finalVerdict ?? combinedVerdict}
                transcript={transcript}
                flags={liveFlags}
                saving={saving}
                saved={saved}
              />
            )}
            <h3 className="font-display text-lg font-semibold">
              {micError ? "Check needs attention" : "Check a live call in real time"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
              {micError ??
                "No local model or Python server is needed. Put the call on speaker near this microphone, or speak directly into it. Groq transcribes audio every few seconds through your Convex backend and checks the conversation for scam patterns. Browser audio measurements provide supporting signals, not proof that a voice is human or AI."}
            </p>
            {micError && <p className="mt-2 text-xs text-rose-600">{micError}</p>}
            <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Spoken language
                </span>
                <Select
                  value={language}
                  disabled={starting || ending}
                  onValueChange={(v) => setLanguage(v as "auto" | "en" | "hi")}
                >
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" className="gap-2" disabled={starting || ending} onClick={() => void startMic()}>
                <Mic className="size-4" />
                {starting ? "Connecting…" : "Start new session"}
              </Button>
            </div>
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
                  Paused — resume when ready
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button 
                  type="button" 
                  variant={micOn ? "default" : "outline"} 
                  size="sm" 
                  className="gap-2 select-none"
                  disabled={starting || ending}
                  onClick={() => { if (micOn) void pauseMic(); else void startMic(); }}
                >
                  {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                  {micOn ? "Pause" : "Resume"}
                </Button>
                <Button type="button" variant="destructive" size="sm" disabled={ending || starting} onClick={() => void endSession()}>
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
                  {transcript.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Awaiting speech</span>
                  ) : aiResult?.ok || finalVerdict ? (
                    <VerdictStamp verdict={combinedVerdict} />
                  ) : (
                    <span className="text-xs text-muted-foreground">Analysis pending</span>
                  )}
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
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void runAiVerdict()}>
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
                          <ScanLine className="mt-0.5 size-4 shrink-0 text-primary" />
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
              No local model required. Browser audio measurements support the
              hosted transcript and scam check. Audio chunks are sent through
              Convex to Groq; Trust Lens does not save the recording. Transcript
              archiving is optional. Acoustic scores cannot verify voice authenticity.
            </p>
          </div>
        )}
      </div>
    </ArchCard>
  );
}

function LastSessionSummary({
  verdict,
  transcript,
  flags,
  saving,
  saved,
}: {
  verdict: "safe" | "suspicious" | "flagged";
  transcript: TranscriptLine[];
  flags: ScamFlag[];
  saving: boolean;
  saved: boolean;
}) {
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
    </div>
  );
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
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
                  <ScanLine className="mt-0.5 size-4 shrink-0 text-primary" />
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
