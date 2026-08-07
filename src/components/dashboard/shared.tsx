import { cn } from "@/lib/utils";
import { VERDICT_META, type Channel, type Verdict } from "@/lib/trustlens";
import { MessageCircle, Phone } from "lucide-react";

/** Clean card with a labelled header bar. */
export function ArchCard({
  label,
  children,
  className,
  action,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(21,23,34,0.04),0_12px_32px_-24px_rgba(21,23,34,0.18)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border/80 bg-muted/40 px-5 py-3">
        <span className="arch-label text-muted-foreground">{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Verdict pill — colored, readable, never rotated. */
export function VerdictStamp({
  verdict,
  className,
}: {
  verdict: Verdict;
  className?: string;
}) {
  const meta = VERDICT_META[verdict];
  return (
    <span className={cn("stamp", meta.tone, className)}>{meta.stamp}</span>
  );
}

/** Clean score meter. */
export function ScoreMeter({
  value,
  label,
  className,
  toneClass,
}: {
  value: number;
  label: string;
  className?: string;
  toneClass?: string;
}) {
  const tone =
    toneClass ??
    (    value >= 70 ? "bg-red-500" : value >= 40 ? "bg-amber-500" : "bg-emerald-500");
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-baseline justify-between">
        <span className="arch-label text-muted-foreground">{label}</span>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {value}
          <span className="text-[10px] text-muted-foreground">/100</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", tone)}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function ChannelTag({ channel }: { channel: Channel }) {
  const Icon = channel === "whatsapp" ? MessageCircle : Phone;
  const label =
    channel === "whatsapp"
      ? "WhatsApp"
      : channel === "phone"
        ? "Phone"
        : "Unknown";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      <Icon className="size-3" />
      {label}
    </span>
  );
}
