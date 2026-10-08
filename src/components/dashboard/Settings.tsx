import { useTheme } from "@/components/ThemeProvider";
import { openCookieSettings } from "@/lib/consent";
import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
export default function Settings() {
  const { theme, setTheme } = useTheme();
  const saved = useQuery(api.settings.get);
  const update = useMutation(api.settings.update);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">Settings</h1>
      <section className="rounded-xl border p-4">
        <h2 className="font-semibold">Appearance</h2>
        <div className="mt-3 flex gap-3">
          {(["light", "dark", "system"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
              className="rounded border px-3 py-2"
            >
              {value}
            </button>
          ))}
        </div>
      </section>
      <p>
        Preferences apply to this web microphone screen and finalized assessment
        notifications.
      </p>
      {(["bannerAlert", "vibrationAlert", "autoNotifyCircle"] as const).map(
        (key) => (
          <label
            key={key}
            className="flex items-center justify-between rounded-xl border p-4"
          >
            <span>
              {
                {
                  bannerAlert: "Microphone warning banner",
                  vibrationAlert: "Vibration where supported by this browser",
                  autoNotifyCircle:
                    "Request email alerts after suspicious assessments",
                }[key]
              }
            </span>
            <input
              type="checkbox"
              aria-label={key}
              disabled={!saved}
              checked={saved?.[key] ?? false}
              onChange={(e) =>
                void update({ [key]: e.target.checked }).catch(() =>
                  toast.error("Preference could not be saved"),
                )
              }
            />
          </label>
        ),
      )}
      <p className="text-sm">
        Email alerts also require verified, consented recipients and an enabled,
        configured delivery service. Provider acceptance is distinct from
        delivery.
      </p>
      <div className="rounded-xl border p-4">
        <h2 className="font-semibold">Unavailable controls</h2>
        <p>
          Direct phone/WhatsApp capture, full-screen takeover, speaker
          verification, and adjustable validated acoustic thresholds are not
          implemented. Historical settings for these features are retained for
          compatibility and are not active.
        </p>
      </div>
      <p>
        Audio processing consent and transcript retention are selected per
        recording or session. Transcript history defaults off. Delete stored
        assessments and pending audio from History.
      </p>
      <div className="flex gap-4">
        <Link to="/privacy" className="underline">
          Privacy policy
        </Link>
        <button
          type="button"
          onClick={openCookieSettings}
          className="underline"
        >
          Cookie preferences
        </button>
      </div>
    </div>
  );
}
