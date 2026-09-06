import { ArchCard, ScoreMeter, VerdictStamp } from "@/components/dashboard/shared";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import {
  behaviorFromFlags,
  scamFlagsFromText,
  type TranscriptLine,
  type Verdict,
} from "@/lib/trustlens";
import { cn } from "@/lib/utils";
import { useAction, useMutation } from "convex/react";
import {
  Brain,
  Check,
  FileAudio,
  Loader2,
  MessageCircle,
  RefreshCw,
  ScanLine,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const MAX_UPLOAD_BYTES = 24 * 1024 * 1024; // stay well under Whisper's 25 MB cap
const ACCEPTED_AUDIO_TYPES = "audio/*,.mp3,.wav,.m4a,.webm,.ogg,.aac,.flac";

type AiVerdictResult =
  | {
      ok: true;
      verdict: "safe" | "suspicious" | "flagged";
      confidence: number;
      summary: string;
      markers: string[];
    }
  | { ok: false; message: string };

/** Convert a File/Blob to a base64 string in fixed-size chunks — required
 *  for anything beyond a few hundred KB, since spreading the whole byte
 *  array into String.fromCharCode(...) at once overflows the call stack. */
async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

type UploadStage = "idle" | "transcribing" | "analyzing" | "done" | "error";

/**
 * Upload Check — send an existing call recording or voice note (mp3, wav,
 * m4a, webm, ogg, aac, flac) through the same Groq Whisper transcription +
 * scam-pattern agent + AI verdict pipeline the live mic check uses, then
 * show the transcript, scam markers, and verdict, and optionally archive
 * the result to the call ledger.
 */
export default function UploadCheck() {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [aiResult, setAiResult] = useState<AiVerdictResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Whisper auto-detects language per request when this isn't pinned, which
  // means the SAME audio can come back transcribed in English one run and
  // Hindi (Devanagari) the next — that's what produced two different
  // verdicts for one clip. Defaulting to "auto" keeps auto-detect for mixed
  // audio, but letting the user pin the spoken language makes transcription
  // (and therefore scam-marker detection) repeatable for a given file.
  const [language, setLanguage] = useState<"auto" | "en" | "hi">("auto");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const transcribe = useAction(api.analyze.groqTranscribe);
  const runGroq = useAction(api.analyze.groqVerdict);
  const recordCall = useMutation(api.calls.record);

  const flags = useMemo(
    () => transcript.flatMap((l) => scamFlagsFromText(l.text)),
    [transcript],
  );
  const verdict: Verdict = aiResult?.ok ? aiResult.verdict : "safe";
  const busy = stage === "transcribing" || stage === "analyzing";

  function reset() {
    setFile(null);
    setStage("idle");
    setError(null);
    setTranscript([]);
    setAiResult(null);
    setSaving(false);
    setSaved(false);
  }

  function pickFile(f: File | null) {
    if (!f) return;
    if (
      !f.type.startsWith("audio/") &&
      !/\.(mp3|wav|m4a|webm|ogg|aac|flac)$/i.test(f.name)
    ) {
      setError(
        "That doesn't look like an audio file. Try mp3, wav, m4a, webm, ogg, aac, or flac.",
      );
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setError("That file is over 24 MB — trim it or export a shorter clip and try again.");
      return;
    }
    setError(null);
    setFile(f);
    setStage("idle");
    setTranscript([]);
    setAiResult(null);
    setSaved(false);
  }

  async function runAnalysis() {
    if (!file) return;
    setError(null);
    setStage("transcribing");
    try {
      const audioBase64 = await fileToBase64(file);
      const transcribeRes = (await transcribe({
        audioBase64,
        mimeType: file.type || "audio/webm",
        filename: file.name,
        language,
      })) as { ok: boolean; text?: string; message?: string };

      if (!transcribeRes.ok) {
        setError(transcribeRes.message ?? "Transcription failed.");
        setStage("error");
        return;
      }

      const lines: TranscriptLine[] = transcribeRes.text
        ? [{ speaker: "caller", text: transcribeRes.text.trim(), t: 0 }]
        : [];
      setTranscript(lines);

      setStage("analyzing");
      const fileFlags = lines.flatMap((l) => scamFlagsFromText(l.text));
      const verdictRes = (await runGroq({
        transcript: lines.map((l) => ({ speaker: l.speaker, text: l.text })),
        flags: fileFlags.map((f) => ({ id: f.id, label: f.label, severity: f.severity })),
        channel: "unknown",
      })) as AiVerdictResult;
      setAiResult(verdictRes);
      setStage("done");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong analyzing this file.",
      );
      setStage("error");
    }
  }

  async function archive() {
    if (!file || saving || saved) return;
    setSaving(true);
    const finalVerdict: Verdict = aiResult?.ok ? aiResult.verdict : "safe";
    try {
      await recordCall({
        callerName: file.name,
        callerNumber: undefined,
        channel: "unknown",
        startedAt: Date.now(),
        durationSec: 0,
        verdict: finalVerdict,
        riskScore: finalVerdict === "flagged" ? 85 : finalVerdict === "suspicious" ? 55 : 15,
        behaviorScore: behaviorFromFlags(flags),
        flags,
        transcript,
        notifiedCircle: finalVerdict === "flagged",
      });
      setSaved(true);
      toast.success("Recording archived to your ledger");
    } catch (err) {
      console.error("Failed to archive uploaded recording", err);
      toast.error("Could not archive this recording");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Upload check
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Already have the recording? Send a saved call or voice note through
          the same detection pipeline as a live call.
        </p>
      </div>

      <ArchCard label="Upload a recording · Groq Whisper + scam-pattern agent">
        <div className="flex flex-col gap-6 p-6 sm:p-8">
          {!file ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/40 hover:border-primary/40",
              )}
            >
              <span className="flex size-14 items-center justify-center rounded-full border-2 border-border bg-card">
                <Upload className="size-6 text-muted-foreground" />
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold">
                  Drop a call recording or voice note
                </h3>
                <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                  mp3, wav, m4a, webm, ogg, aac, or flac — up to 24 MB. Groq
                  Whisper transcribes it, then the scam-pattern agent and AI
                  verdict run the same checks as a live call.
                </p>
              </div>
              <Button type="button" variant="outline" className="mt-1 gap-2">
                <Upload className="size-4" />
                Choose a file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_AUDIO_TYPES}
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileAudio className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={reset}
                  disabled={busy}
                  aria-label="Remove file"
                >
                  <X className="size-4" />
                </Button>
              </div>

              {stage === "idle" && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Spoken language
                    </span>
                    <Select
                      value={language}
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
                  <Button type="button" className="gap-2" onClick={runAnalysis}>
                    <ScanLine className="size-4" />
                    Analyze this recording
                  </Button>
                </div>
              )}

              {busy && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {stage === "transcribing"
                    ? "Transcribing with Groq Whisper…"
                    : "Cross-checking transcript with the AI verdict…"}
                </p>
              )}

              {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-50 px-3 py-2.5 text-sm leading-relaxed text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </div>
              )}

              {(transcript.length > 0 || stage === "done") && (
                <>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-border bg-muted/40 p-4">
                      <p className="arch-label mb-3 flex items-center gap-2 text-muted-foreground">
                        <MessageCircle className="size-3.5" />
                        Transcript · Groq Whisper
                      </p>
                      <div className="max-h-[200px] space-y-2 overflow-y-auto">
                        {transcript.length === 0 ? (
                          <p className="text-sm italic text-muted-foreground">
                            No speech detected in this file.
                          </p>
                        ) : (
                          transcript.map((l, i) => (
                            <p key={i} className="text-sm leading-snug">
                              "{l.text}"
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/40 p-4">
                      <p className="arch-label mb-3 text-muted-foreground">
                        Scam markers · {flags.length}
                      </p>
                      {flags.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nothing suspicious in the words.
                        </p>
                      ) : (
                        <ul className="max-h-[200px] space-y-2 overflow-y-auto">
                          {flags.map((f) => (
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

                  {aiResult && !aiResult.ok && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                      {aiResult.message}
                    </div>
                  )}

                  {aiResult?.ok && (
                    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Brain className="size-4" />
                          </span>
                          <p className="text-sm font-semibold">AI verdict · Groq</p>
                        </div>
                        <VerdictStamp verdict={verdict} />
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

                  {stage === "done" && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="arch-label text-muted-foreground">
                        {saving
                          ? "Archiving…"
                          : saved
                            ? "Saved to your ledger"
                            : "Not archived yet"}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={archive}
                          disabled={saving || saved}
                        >
                          {saving ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : saved ? (
                            <Check className="size-3.5 text-emerald-600" />
                          ) : (
                            <RefreshCw className="size-3.5" />
                          )}
                          {saved ? "Archived" : "Save to ledger"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={reset}>
                          Analyze another
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            The file is sent to Groq Whisper for transcription and is not
            stored by Trust Lens beyond this session unless you save it to
            your ledger.
          </p>
        </div>
      </ArchCard>
    </div>
  );
}
