import { ArchCard, ScoreMeter, VerdictStamp } from "@/components/dashboard/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  CATEGORY_LABEL,
  isValidNumber,
  KNOWN_SCAM_NUMBERS,
  REPORT_CATEGORIES,
  type ReportCategory,
} from "@/lib/numbers";
import { fmtClock, fmtDate, type Verdict } from "@/lib/trustlens";
import { cn } from "@/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Brain,
  Flag,
  History,
  Loader2,
  Radar,
  RefreshCw,
  ScanLine,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type LookupResult =
  | {
      ok: true;
      number: string;
      display: string;
      riskScore: number;
      heuristicVerdict: Verdict;
      verdict: Verdict;
      confidence: number;
      reasons: string[];
      reports: { category: string; note: string | null; createdAt: number }[];
      ai: {
        verdict: Verdict;
        confidence: number;
        explanation: string;
        markers: string[];
      } | null;
      groqConfigured: boolean;
    }
  | { ok: false; message: string };

export default function NumberCheck() {
  const runLookup = useAction(api.numberLookup.lookup);
  const reportNumber = useMutation(api.numbers.reportNumber);
  const checks = useQuery(api.numbers.history);

  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("scam-call");
  const [note, setNote] = useState("");
  const [reporting, setReporting] = useState(false);

  async function check(number: string) {
    const value = number.trim() || input.trim();
    if (!value) return;
    if (!isValidNumber(value)) {
      setInputError(
        "Enter a valid phone number — 10 to 12 digits (e.g. 98765 43210).",
      );
      setResult(null);
      return;
    }
    setInputError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = (await runLookup({ number: value })) as LookupResult;
      setResult(res);
      if (!res.ok) toast.error(res.message);
    } catch {
      setResult({ ok: false, message: "The lookup failed — please try again." });
    } finally {
      setLoading(false);
    }
  }

  async function handleReport() {
    if (!result || !("ok" in result) || !result.ok) return;
    setReporting(true);
    try {
      await reportNumber({
        number: result.number,
        display: result.display,
        category,
        note: note.trim() || undefined,
      });
      toast.success("Report recorded — re-check the number to see the updated risk.");
      setNote("");
    } catch {
      toast.error("Could not record the report");
    } finally {
      setReporting(false);
    }
  }

  const reportCount = result && "ok" in result && result.ok ? result.reports.length : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="arch-label text-primary">Number screening desk</p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
          Check a number before it calls you
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Paste any phone number — a missed call, an SMS sender, a WhatsApp
          contact — and get a risk verdict from pattern heuristics, your team's
          shared reports, and a Groq second opinion.
        </p>
      </div>

      {/* Search */}
      <ArchCard label="Screening · lookup">
        <div className="space-y-4 p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void check(input);
            }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <Input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (inputError) setInputError(null);
              }}
              placeholder="+91 98765 43210"
              inputMode="tel"
              className={cn(
                "h-11 flex-1 font-mono text-base",
                inputError && "border-rose-500 focus-visible:ring-rose-500/40",
              )}
              aria-label="Phone number to check"
              aria-invalid={Boolean(inputError)}
            />
            <Button type="submit" size="lg" className="gap-2" disabled={loading || !input.trim()}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              {loading ? "Screening…" : "Check number"}
            </Button>
          </form>
          {inputError && (
            <p className="flex items-center gap-2 text-xs font-medium text-rose-600">
              <ShieldAlert className="size-3.5" />
              {inputError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="arch-label text-muted-foreground">Try:</span>
            {KNOWN_SCAM_NUMBERS.slice(0, 3).map((s) => (
              <button
                key={s.number}
                type="button"
                onClick={() => {
                  setInput(s.display);
                  void check(s.display);
                }}
                className="rounded-full border border-border bg-muted/40 px-3 py-1 font-mono text-xs transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {s.display}
              </button>
            ))}
          </div>
        </div>
      </ArchCard>

      {/* Result */}
      {result && !result.ok && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {result.message}
        </div>
      )}

      {result && "ok" in result && result.ok && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-5 lg:grid-cols-5"
        >
          {/* Verdict card */}
          <div className="lg:col-span-3">
            <ArchCard
              label="Lookup result"
              action={
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void check(result.number)} disabled={loading}>
                  <RefreshCw className="size-3" />
                  Re-check
                </Button>
              }
            >
              <div className="space-y-5 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xl font-semibold tracking-tight">
                    {result.display}
                  </span>
                  <VerdictStamp verdict={result.verdict} />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <ScoreMeter
                    label={`Risk score · ${reportCount} team report${reportCount === 1 ? "" : "s"}`}
                    value={result.riskScore}
                    toneClass={
                      result.verdict === "flagged"
                        ? "bg-red-500"
                        : result.verdict === "suspicious"
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }
                    className="max-w-[260px]"
                  />
                  <span className="arch-label text-muted-foreground">
                    heuristic {result.heuristicVerdict} · AI{" "}
                    {result.ai ? result.ai.verdict : "offline"}
                  </span>
                </div>
                {result.reasons.length > 0 ? (
                  <ul className="space-y-2">
                    {result.reasons.map((r) => (
                      <li key={r} className="flex items-start gap-2 text-sm leading-snug">
                        <ScanLine
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            result.verdict === "flagged"
                              ? "text-red-600"
                              : "text-amber-600",
                          )}
                        />
                        {r}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    No red flags on file — an unremarkable number is not proof
                    of safety, but nothing stands out here.
                  </p>
                )}
              </div>
            </ArchCard>
          </div>

          {/* AI + report */}
          <div className="space-y-5 lg:col-span-2">
            <ArchCard label="AI opinion · Groq">
              <div className="space-y-4 p-5">
                {!result.groqConfigured && (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    Add <span className="font-mono">GROQ_API_KEY</span> in the
                    project Keys UI to enable the AI second opinion. Pattern
                    and team-report scoring still run.
                  </p>
                )}
                {result.ai ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <VerdictStamp verdict={result.ai.verdict} />
                      <span className="font-mono text-xs text-muted-foreground">
                        {result.ai.confidence}/100 confidence
                      </span>
                    </div>
                    {result.ai.explanation && (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {result.ai.explanation}
                      </p>
                    )}
                    {result.ai.markers.length > 0 && (
                      <ul className="space-y-1.5">
                        {result.ai.markers.map((m, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <Brain className="mt-0.5 size-4 shrink-0 text-blue-600" />
                            <span className="leading-snug">{m}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Radar className="size-4 text-primary" />
                    Waiting for Groq — configured, but no opinion returned this
                    time.
                  </p>
                )}
              </div>
            </ArchCard>

            <ArchCard label="Add to the shared knowledge base">
              <div className="space-y-3 p-5">
                <div className="space-y-1.5">
                  <Label htmlFor="nc-cat" className="text-xs">
                    What was this number?
                  </Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as ReportCategory)}>
                    <SelectTrigger id="nc-cat" className="w-full">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {REPORT_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nc-note" className="text-xs">
                    Note <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="nc-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. “claimed to be from the bank, asked for OTP”"
                  />
                </div>
                <Button
                  type="button"
                  variant={result.verdict === "flagged" ? "default" : "outline"}
                  className="w-full gap-2"
                  onClick={handleReport}
                  disabled={reporting}
                >
                  {reporting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Flag className="size-4" />
                  )}
                  {reporting ? "Recording…" : "Report this number"}
                </Button>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Reports are visible to your whole team. Reporting a number
                  again updates its category and note.
                </p>
              </div>
            </ArchCard>
          </div>
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Knowledge base */}
        <ArchCard label="Knowledge base · seed reference">
          <div className="p-5">
            <ul className="space-y-2.5">
              {KNOWN_SCAM_NUMBERS.map((s) => (
                <li key={s.number}>
                  <button
                    type="button"
                    onClick={() => {
                      setInput(s.display);
                      void check(s.display);
                    }}
                    className="group flex w-full items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/70"
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg",
                        s.severity === "flagged"
                          ? "bg-red-50 text-red-600"
                          : "bg-amber-50 text-amber-600",
                      )}
                    >
                      {s.severity === "flagged" ? (
                        <ShieldAlert className="size-4" />
                      ) : (
                        <ShieldCheck className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs font-medium">
                        {s.display}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.label} · {CATEGORY_LABEL[s.category] ?? s.category}
                      </span>
                    </span>
                    <span className="arch-label text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      Check →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
              Reference entries ship with the app so the desk is useful from day
              one; your team's reports grow the shared set over time.
            </p>
          </div>
        </ArchCard>

        {/* Recent checks */}
        <ArchCard label="Recent checks · your desk">
          <div className="p-5">
            {!checks ? (
              <div className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl border border-border bg-muted/40" />
                ))}
              </div>
            ) : checks.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <History className="size-6 text-muted-foreground" />
                <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                  No checks yet. Run your first lookup above — every screening
                  is recorded here for the team.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {checks.map((c: Doc<"numberChecks">) => (
                  <li key={c._id}>
                    <button
                      type="button"
                      onClick={() => {
                        setInput(c.display);
                        void check(c.display);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/70"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-xs font-medium">
                          {c.display}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {fmtDate(c.createdAt)} · {fmtClock(c.createdAt)} · risk{" "}
                          {c.riskScore}
                        </span>
                      </span>
                      <VerdictStamp verdict={c.verdict} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ArchCard>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-sky-300 bg-sky-50/60 p-4 text-sm leading-relaxed text-muted-foreground dark:border-sky-500/40 dark:bg-sky-500/10">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-sky-600" />
        <p>
          The desk is a screening aid, not a court record. A clean result means
          nothing stands out — for urgent calls, the definitive test is always a
          callback on a number you already trust.
        </p>
      </div>
    </div>
  );
}
