import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { BellRing, Lock, MonitorUp, Phone, ShieldAlert, Vibrate, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const SENSITIVITY = [
  { value: 1 as const, label: "Standard", note: "Fewest alerts — best for most calls" },
  { value: 2 as const, label: "High", note: "Flags borderline voices and softer patterns" },
  { value: 3 as const, label: "Very high", note: "Most cautious — more alerts, fewer false negatives" },
];

export default function Settings() {
  const saved = useQuery(api.settings.get);
  const update = useMutation(api.settings.update);

  const [form, setForm] = useState({
    bannerAlert: true,
    vibrationAlert: true,
    fullscreenAlert: false,
    autoNotifyCircle: true,
    sensitivity: 2 as 1 | 2 | 3,
    channelPhone: true,
    channelWhatsapp: true,
  });

  useEffect(() => {
    if (saved) setForm(saved);
  }, [saved]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    void update({ [key]: value } as Partial<typeof form>).catch(() =>
      toast.error("Could not save settings"),
    );
  }

  const toggles: {
    key: Exclude<keyof typeof form, "sensitivity">;
    icon: typeof BellRing;
    title: string;
    note: string;
  }[] = [
    {
      key: "bannerAlert",
      icon: MonitorUp,
      title: "In-call banner",
      note: "Show the mid-call warning banner on phone and WhatsApp calls.",
    },
    {
      key: "vibrationAlert",
      icon: Vibrate,
      title: "Distinct vibration",
      note: "Double-pulse vibration pattern that differs from a normal notification.",
    },
    {
      key: "fullscreenAlert",
      icon: ShieldAlert,
      title: "Full-screen takeover",
      note: "For critical verdicts, cover the screen until you acknowledge.",
    },
    {
      key: "autoNotifyCircle",
      icon: BellRing,
      title: "Auto-notify alert circle",
      note: "Alert your team the moment a call is flagged (risk ≥ 70).",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="arch-label text-primary">Configuration · your guard</p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Tune how aggressively Trust Lens watches, warns, and reaches out.
          Changes apply immediately and are saved to your account.
        </p>
      </div>

      {/* Interventions */}
      <section className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border/80 bg-muted/40 px-5 py-3">
          <span className="arch-label text-muted-foreground">
            When a call is flagged
          </span>
        </div>
        <div className="divide-y divide-border/70">
          {toggles.map((t) => (
            <label
              key={t.key}
              className="flex cursor-pointer items-center gap-4 px-5 py-3.5"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <t.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t.title}</span>
                <span className="block text-xs leading-snug text-muted-foreground">
                  {t.note}
                </span>
              </span>
              <Switch
                checked={form[t.key]}
                onCheckedChange={(v) => set(t.key, v)}
              />
            </label>
          ))}
        </div>
      </section>

      {/* Channels */}
      <section className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border/80 bg-muted/40 px-5 py-3">
          <span className="arch-label text-muted-foreground">
            Channels under guard
          </span>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {(
            [
              ["channelPhone", "Phone calls", Phone],
              ["channelWhatsapp", "WhatsApp voice calls", Volume2],
            ] as const
          ).map(([key, title, Icon]) => (
            <label
              key={key}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                form[key]
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-muted/40",
              )}
            >
              <Icon className="size-4 text-primary" />
              <span className="flex-1 text-sm font-medium">{title}</span>
              <Switch
                checked={form[key]}
                onCheckedChange={(v) => set(key, v)}
              />
            </label>
          ))}
        </div>
      </section>

      {/* Sensitivity */}
      <section className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border/80 bg-muted/40 px-5 py-3">
          <span className="arch-label text-muted-foreground">Sensitivity</span>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {SENSITIVITY.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => set("sensitivity", s.value)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                form.sensitivity === s.value
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-muted/40 hover:border-primary/40",
              )}
            >
              <p className="text-sm font-semibold">{s.label}</p>
              <p
                className={cn(
                  "mt-1 text-xs leading-snug",
                  form.sensitivity === s.value
                    ? "text-primary-foreground/80"
                    : "text-muted-foreground",
                )}
              >
                {s.note}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Privacy */}
      <section className="rounded-2xl border border-dashed border-sky-300 bg-sky-50/60 p-5 dark:border-sky-500/40 dark:bg-sky-500/10">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 size-5 shrink-0 text-sky-600" />
          <div className="text-sm leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">
              Privacy by design
            </p>
            <p className="mt-1">
              Voice analysis runs on your device. Transcripts are stored only
              when you opt in per-call, and you can wipe the entire ledger in
              one tap from the Call Ledger. Your data never trains anyone's
              models, and circle members never see your conversations.
            </p>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => saved && setForm(saved)}
        >
          Reset to saved
        </Button>
      </div>
    </div>
  );
}
