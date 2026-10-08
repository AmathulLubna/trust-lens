import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { onOpenCookieSettings, saveConsent, useConsent } from "@/lib/consent";
import { Cookie } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

export function CookieConsent() {
  const consent = useConsent();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(false);

  useEffect(() => onOpenCookieSettings(() => {
    setPrefs(consent?.preferences ?? false);
    setOpen(true);
  }), [consent]);

  const decide = (preferences: boolean) => {
    saveConsent(preferences);
    setOpen(false);
  };

  return (
    <>
      {consent === null && !open && (
        <div
          role="dialog"
          aria-label="Cookie consent"
          className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-3xl rounded-2xl border border-border bg-card p-4 shadow-xl sm:bottom-5 sm:p-5 md:pb-4"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Cookie className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold">We use a few cookies</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Essential storage keeps you signed in and remembers this choice. Optional
                preference storage remembers your theme. We use no advertising or analytics
                cookies. See our{" "}
                <Link to="/privacy" className="text-primary underline underline-offset-2">
                  Privacy Policy
                </Link>
                .
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => decide(true)}>
                  Accept all
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide(false)}>
                  Essential only
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPrefs(false);
                    setOpen(true);
                  }}
                >
                  Customize
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cookie preferences</DialogTitle>
            <DialogDescription>
              Choose what Trust Lens may store in your browser. You can change this any time
              from Settings or the Privacy Policy page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
              <div className="flex-1">
                <p className="text-sm font-medium">Essential</p>
                <p className="text-xs leading-snug text-muted-foreground">
                  Sign-in session and your cookie choice. Needed for the app to work, so
                  always on.
                </p>
              </div>
              <Switch checked disabled aria-label="Essential storage (always on)" />
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border p-3">
              <div className="flex-1">
                <p className="text-sm font-medium">Preferences</p>
                <p className="text-xs leading-snug text-muted-foreground">
                  Remembers your light / dark theme between visits.
                </p>
              </div>
              <Switch
                checked={prefs}
                onCheckedChange={setPrefs}
                aria-label="Preference storage"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => decide(false)}>
              Essential only
            </Button>
            <Button variant="outline" onClick={() => decide(prefs)}>
              Save choices
            </Button>
            <Button onClick={() => decide(true)}>Accept all</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
