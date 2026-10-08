import { useTheme, type Theme } from "@/components/ThemeProvider";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { openCookieSettings } from "@/lib/consent";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { BellRing, Cookie, Lock, Monitor, Moon, Palette, Sun } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export default function Settings() {
  const saved = useQuery(api.settings.get);
  const update = useMutation(api.settings.update);
  const { theme, setTheme } = useTheme();

  const autoNotify = saved?.autoNotifyCircle ?? true;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="arch-label text-primary">Configuration · your guard</p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Appearance, alerts and privacy. Changes apply immediately.
        </p>
      </div>

      {/* Appearance */}
      <section className="rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border/80 bg-muted/40 px-5 py-3">
          <Palette className="size-3.5 text-muted-foreground" />
          <span className="arch-label text-muted-foreground">Appearance</span>
        </div>
        <div className="p-5">
          <p className="text-sm font-medium">Theme</p>
          <p className="text-xs leading-snug text-muted-foreground">
            Choose light or dark, or follow your device.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition-colors",
                  theme === value
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Alerts */}
      <section className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border/80 bg-muted/40 px-5 py-3">
          <span className="arch-label text-muted-foreground">When a call is flagged</span>
        </div>
        <label className="flex cursor-pointer items-center gap-4 px-5 py-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BellRing className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Auto-notify alert circle</span>
            <span className="block text-xs leading-snug text-muted-foreground">
              Alert your team the moment a call is flagged (risk ≥ 70).
            </span>
          </span>
          <Switch
            checked={autoNotify}
            disabled={saved === undefined}
            onCheckedChange={(v) =>
              void update({ autoNotifyCircle: v }).catch(() =>
                toast.error("Could not save settings"),
              )
            }
          />
        </label>
      </section>

      {/* Privacy */}
      <section className="rounded-2xl border border-dashed border-sky-300 bg-sky-50/60 p-5 dark:border-sky-500/40 dark:bg-sky-500/10">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 size-5 shrink-0 text-sky-600" />
          <div className="text-sm leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">Privacy by design</p>
            <p className="mt-1">
              Acoustic scoring runs in your browser. Short audio chunks go to Groq for
              transcription and are never stored by Trust Lens. Transcripts are saved only when
              you opt in per call, and you can wipe the whole ledger in one tap from the Call
              Ledger. Your data is not used to train models, and circle members never see your
              conversations.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link
                to="/privacy"
                className="text-xs font-medium text-primary underline underline-offset-2"
              >
                Read the Privacy Policy
              </Link>
              <button
                type="button"
                onClick={openCookieSettings}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline underline-offset-2"
              >
                <Cookie className="size-3.5" />
                Cookie preferences
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
