import { Button } from "@/components/ui/button";
import { ChannelTag, VerdictStamp } from "@/components/dashboard/shared";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { fmtClock, fmtDate, todayLong, VERDICT_META } from "@/lib/trustlens";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  AudioLines,
  BellRing,
  Brain,
  Eye,
  Phone,
  Search,
  ShieldCheck,
  Siren,
  Users,
} from "lucide-react";

export default function Overview({
  onNavigate,
}: {
  onNavigate: (tab: "guard" | "history" | "circle" | "number") => void;
}) {
  const { user } = useAuth();
  const logs = useQuery(api.calls.list);
  const circle = useQuery(api.circle.list);
  const settings = useQuery(api.settings.get);

  const realLogs = logs?.filter(
    (l) => l.source === "upload" || l.source === "microphone",
  );
  const total = realLogs?.length ?? 0;
  const flagged =
    realLogs?.filter((l) => l.verdict === "suspicious").length ?? 0;
  const firstName = (user?.name ?? "friend").split(" ")[0];

  const statBlocks = [
    {
      icon: Eye,
      label: "Calls screened",
      value: String(total),
      sub: "all-time ledger",
      tint: "bg-primary/10 text-primary",
    },
    {
      icon: Siren,
      label: "Verification warnings",
      value: String(flagged),
      sub: "independent verification advised",
      tint: "bg-red-50 text-red-600",
    },
    {
      icon: Users,
      label: "Circle members",
      value: String(circle?.length ?? 0),
      sub: "delivery requires verified consent",
      tint: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
    },
    {
      icon: AudioLines,
      label: "Input coverage",
      value: "Visible",
      sub: "gaps and failures retained",
      tint: "bg-emerald-50 text-emerald-600",
    },
  ];

  const recent = logs?.slice(0, 3) ?? [];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="arch-label text-muted-foreground">{todayLong()}</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Welcome back, {firstName}
          </h2>
        </div>
        <span className="stamp self-start text-emerald-600 sm:self-auto">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          Ready to start
        </span>
      </div>

      {/* Protection status — dark instrument surface, matches auth/landing signature */}
      <div className="grain relative overflow-hidden rounded-3xl bg-[#0b0d12] p-6 text-white shadow-[0_24px_55px_-28px_rgba(76,224,210,0.35)] sm:p-7">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(700px 320px at 15% -20%, rgba(76,224,210,0.18), transparent 60%)",
          }}
        />
        <div className="pointer-events-none absolute -right-10 -top-14 size-48 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute -bottom-20 -left-6 size-56 rounded-full border border-white/10" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#4ce0d2]/15 backdrop-blur">
              <ShieldCheck className="size-7 text-[#4ce0d2]" />
            </span>
            <div>
              <p className="font-display text-lg font-semibold">
                {settings
                  ? "Screening available on request"
                  : "Loading your guard…"}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/70">
                Microphone audio and consented recording uploads
                <span className="text-white/45">
                  {" "}
                  · start screening from this workspace
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="lg"
              className="gap-2 bg-[#4ce0d2] text-[#06211d] hover:bg-[#6ee7db]"
              onClick={() => onNavigate("guard")}
            >
              <Phone className="size-4" />
              Run a test call
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="gap-2 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              onClick={() => onNavigate("number")}
            >
              <Search className="size-4" />
              Check a number
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statBlocks.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.45 }}
            className="rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-[0_12px_32px_-24px_rgba(21,23,34,0.25)]"
          >
            <span
              className={`flex size-9 items-center justify-center rounded-xl ${s.tint}`}
            >
              <s.icon className="size-4" />
            </span>
            <p className="numeral mt-3 text-3xl font-bold leading-none">
              {s.value}
            </p>
            <p className="mt-1.5 text-sm font-medium">{s.label}</p>
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent calls */}
        <div className="rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border/80 bg-muted/40 px-5 py-3">
            <span className="arch-label text-muted-foreground">
              Recent screenings
            </span>
            <button
              type="button"
              onClick={() => onNavigate("history")}
              className="arch-label text-primary hover:underline"
            >
              Full ledger →
            </button>
          </div>
          <div className="divide-y divide-border/70">
            {recent.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No calls yet. Run the{" "}
                <button
                  type="button"
                  onClick={() => onNavigate("guard")}
                  className="text-primary underline underline-offset-4"
                >
                  scenario call
                </button>{" "}
                to see the guard work.
              </p>
            )}
            {recent.map((log) => (
              <div key={log._id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {log.callerName ?? "Unknown caller"}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {fmtDate(log.startedAt)} · {fmtClock(log.startedAt)} ·{" "}
                    {log.durationSec}s
                  </p>
                </div>
                <ChannelTag channel={log.channel} />
                <span
                  className={`h-1.5 w-14 rounded-full ${VERDICT_META[log.verdict].bar}`}
                />
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {log.riskScore}
                </span>
                <VerdictStamp verdict={log.verdict} />
              </div>
            ))}
          </div>
        </div>

        {/* How the guard works */}
        <div className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border/80 bg-muted/40 px-5 py-3">
            <span className="arch-label text-muted-foreground">
              Screening flow
            </span>
          </div>
          <div className="divide-y divide-border/70">
            {[
              {
                n: "01",
                icon: AudioLines,
                t: "Capture",
                d: "Nearby microphone audio in six-second segments, analyzed by the configured service.",
                tint: "bg-primary/10 text-primary",
              },
              {
                n: "02",
                icon: Brain,
                t: "Analyze",
                d: "The acoustic service and transcript request rules report separate findings and availability.",
                tint: "bg-sky-50 text-sky-600",
              },
              {
                n: "03",
                icon: BellRing,
                t: "Intervene",
                d: "Verification guidance, optional browser vibration, and verified-recipient email delivery status.",
                tint: "bg-emerald-50 text-emerald-600",
              },
            ].map((s) => (
              <div key={s.n} className="flex items-center gap-4 px-5 py-3.5">
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${s.tint}`}
                >
                  <s.icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{s.t}</p>
                  <p className="text-xs leading-snug text-muted-foreground">
                    {s.d}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => onNavigate("circle")}
            >
              Manage verified alert recipients
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
