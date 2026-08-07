import { Button } from "@/components/ui/button";
import { ChannelTag, VerdictStamp } from "@/components/dashboard/shared";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import {
  fmtClock,
  fmtDate,
  todayLong,
  VERDICT_META,
} from "@/lib/trustlens";
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

  const total = logs?.length ?? 0;
  const flagged = logs?.filter((l) => l.verdict === "flagged").length ?? 0;
  const firstName = (user?.name ?? "friend").split(" ")[0];

  const statBlocks = [
    {
      icon: Eye,
      label: "Calls screened",
      value: String(total),
      sub: "all-time ledger",
      tint: "bg-blue-50 text-blue-600",
    },
    {
      icon: Siren,
      label: "Scam attempts",
      value: String(flagged),
      sub: "flagged & intercepted",
      tint: "bg-red-50 text-red-600",
    },
    {
      icon: Users,
      label: "Circle members",
      value: String(circle?.length ?? 0),
      sub: "alerted on flags",
      tint: "bg-sky-50 text-sky-600",
    },
    {
      icon: AudioLines,
      label: "Time to verdict",
      value: "< 2s",
      sub: "target on live audio",
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
          Guard active
        </span>
      </div>

      {/* Protection status */}
      <div className="relative overflow-hidden rounded-3xl bg-blue-600 p-6 text-white shadow-[0_24px_55px_-28px_rgba(37,99,235,0.45)] sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-14 size-48 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute -bottom-20 -left-6 size-56 rounded-full border border-white/10" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <ShieldCheck className="size-7 text-white" />
            </span>
            <div>
              <p className="font-display text-lg font-semibold">
                {settings ? "Screening is on" : "Loading your guard…"}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-blue-50/90">
                {[
                  settings?.channelPhone && "Phone calls",
                  settings?.channelWhatsapp && "WhatsApp voice",
                ]
                  .filter(Boolean)
                  .join(" · ") || "No channels enabled"}
                <span className="text-blue-100/70">
                  · sensitivity {["", "Standard", "High", "Very high"][settings?.sensitivity ?? 2]}
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="lg"
              className="gap-2 bg-white text-blue-700 hover:bg-blue-50"
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
              The three agents
            </span>
          </div>
          <div className="divide-y divide-border/70">
            {[
              {
                n: "01",
                icon: AudioLines,
                t: "Intercept",
                d: "Live audio in 400 ms windows, entirely on-device.",
                tint: "bg-blue-50 text-blue-600",
              },
              {
                n: "02",
                icon: Brain,
                t: "Analyze",
                d: "Voice agent scores synthetic artifacts; behaviour agent reads the conversation for scam patterns — in parallel.",
                tint: "bg-sky-50 text-sky-600",
              },
              {
                n: "03",
                icon: BellRing,
                t: "Intervene",
                d: "Banner + vibration, one clear action, and your circle is notified on critical calls.",
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
                  <p className="text-xs leading-snug text-muted-foreground">{s.d}</p>
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
              Add teammates for instant alerts
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
