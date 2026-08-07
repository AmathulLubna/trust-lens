import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ChannelTag, VerdictStamp } from "@/components/dashboard/shared";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { fmtClock, fmtDate, fmtDuration, VERDICT_META, type Verdict } from "@/lib/trustlens";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, Eraser, ScrollText, ScanLine } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Filter = "all" | Verdict;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "flagged", label: "Flagged" },
  { value: "suspicious", label: "Suspicious" },
  { value: "safe", label: "Safe" },
];

export default function History() {
  const logs = useQuery(api.calls.list);
  const clearLogs = useMutation(api.calls.clear);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = (logs ?? []).filter((l) => filter === "all" || l.verdict === filter);

  async function handleClear() {
    try {
      await clearLogs();
      toast.success("Ledger cleared");
    } catch {
      toast.error("Could not clear the ledger");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="arch-label text-primary">Call ledger · archive</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
            Every screened call, on record
          </h2>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="gap-2" disabled={!logs?.length}>
              <Eraser className="size-4" />
              Clear ledger
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear the ledger?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes every archived call for your account.
                Verdicts and scores are removed too — this cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep the record</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={handleClear}
              >
                Clear everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "arch-label rounded-full border px-3.5 py-1.5 transition-colors",
              filter === f.value
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!logs ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl border border-border bg-card/60" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty className="rounded-2xl border-border bg-card">
          <EmptyMedia variant="icon">
            <ScrollText className="size-6" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              {filter === "all" ? "The ledger is blank" : `No ${filter} calls`}
            </EmptyTitle>
            <EmptyDescription>
              {filter === "all"
                ? "Run the scenario call in Live Guard and the record will appear here."
                : "No calls match this verdict. Try another filter or run a new screening."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {/* header (desktop) */}
          <div className="hidden grid-cols-[1.2fr_1fr_0.7fr_1fr_auto] items-center gap-4 border-b border-border/80 bg-muted/50 px-5 py-2.5 md:grid">
            {["Caller", "When", "Duration", "Risk", "Verdict"].map((h) => (
              <span key={h} className="arch-label text-muted-foreground">
                {h}
              </span>
            ))}
          </div>
          <div className="divide-y divide-border/70">
            {filtered.map((log) => (
              <LedgerRow
                key={log._id}
                log={log}
                expanded={expanded === log._id}
                onToggle={() =>
                  setExpanded((cur) => (cur === log._id ? null : log._id))
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LedgerRow({
  log,
  expanded,
  onToggle,
}: {
  log: Doc<"callLogs">;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasDetails = log.flags.length > 0 || (log.transcript?.length ?? 0) > 0;
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "grid w-full grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40 md:grid-cols-[1.2fr_1fr_0.7fr_1fr_auto] md:gap-4",
          expanded && "bg-muted/30",
        )}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {log.callerName ?? "Unknown caller"}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {log.callerNumber ?? "—"}
            </span>
            <ChannelTag channel={log.channel} />
          </div>
        </div>
        <div className="hidden md:block">
          <p className="text-sm">{fmtDate(log.startedAt)}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {fmtClock(log.startedAt)}
          </p>
        </div>
        <div className="hidden md:block">
          <p className="font-mono text-sm tabular-nums">
            {fmtDuration(log.durationSec ?? 0)}
          </p>
        </div>
        <div className="hidden md:flex md:items-center md:gap-2">
          <span
            className={`h-1.5 w-16 rounded-full ${VERDICT_META[log.verdict].bar}`}
          />
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {log.riskScore}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <VerdictStamp verdict={log.verdict} />
          {hasDetails && (
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
            />
          )}
        </div>
        {/* mobile meta */}
        <div className="col-span-2 flex items-center justify-between md:hidden">
          <span className="text-xs text-muted-foreground">
            {fmtDate(log.startedAt)} · {fmtClock(log.startedAt)} ·{" "}
            {fmtDuration(log.durationSec ?? 0)}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            risk {log.riskScore}
          </span>
        </div>
      </button>
      {expanded && hasDetails && (
        <div className="border-t border-border/60 bg-muted/30 px-5 py-4">
          {log.flags.length > 0 && (
            <div className="mb-4">
              <p className="arch-label mb-2 text-muted-foreground">
                Markers ({log.flags.length})
              </p>
              <ul className="space-y-1.5">
                {log.flags.map((f) => (
                  <li key={f.id} className="flex items-start gap-2 text-sm">
                    <ScanLine
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        f.severity === "critical"
                          ? "text-red-600"
                          : "text-amber-600",
                      )}
                    />
                    {f.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {log.transcript && log.transcript.length > 0 && (
            <div>
              <p className="arch-label mb-2 text-muted-foreground">
                Transcript (stored by opt-in)
              </p>
              <div className="space-y-1.5">
                {log.transcript.map((line) => (
                  <p key={line.t} className="text-sm leading-snug">
                    <span className="mr-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                      {line.speaker}
                    </span>
                    “{line.text}”
                  </p>
                ))}
              </div>
            </div>
          )}
          {log.notifiedCircle && (
            <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-400">
              ✓ Alert circle notified on this call.
            </p>
          )}
        </div>
      )}
    </>
  );
}
