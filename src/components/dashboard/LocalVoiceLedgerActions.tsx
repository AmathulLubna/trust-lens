import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BellRing, Check, Loader2, ScrollText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import type { VoiceResult } from "@/lib/local-voice";

export default function LocalVoiceLedgerActions({ result, checkTimeSec }: {
  result: VoiceResult;
  checkTimeSec?: number;
}) {
  const [sessionId] = useState(() => `local-voice:${crypto.randomUUID()}`);
  const status = useQuery(api.calls.localVoiceArchiveStatus, { sessionId });
  const record = useMutation(api.calls.recordLocalVoice);
  const [saving, setSaving] = useState<"ledger" | "circle" | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const aiLike = result.score >= result.threshold;
  const pending = status?.alertStatus === "queued";
  const sent = status?.alertStatus === "sent";

  async function save(alertCircle: boolean) {
    if (inFlight.current || (alertCircle && !aiLike)) return;
    inFlight.current = true;
    setSaving(alertCircle ? "circle" : "ledger");
    setError("");
    try {
      await record({ sessionId, alertCircle, result: {
        model: result.model as "v4" | "v5", score: result.score,
        threshold: result.threshold, seconds: result.seconds,
        windows: result.windows, checkTimeSec,
      } });
    } catch {
      setError("Could not save this request. Try again; retrying will not create a duplicate ledger entry.");
    } finally {
      inFlight.current = false;
      setSaving(null);
    }
  }

  if (status === null) return <p className="text-sm text-muted-foreground">Sign in to TrustLens to add this result to your ledger.</p>;

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={Boolean(saving) || status === undefined || status.saved} onClick={() => void save(false)}>
          {saving === "ledger" ? <Loader2 className="size-4 animate-spin" /> : status?.saved ? <Check className="size-4" /> : <ScrollText className="size-4" />}
          {saving === "ledger" ? "Adding to ledger…" : status?.saved ? "Added to ledger" : "Add to ledger"}
        </Button>
        {aiLike && (
          <Button disabled={Boolean(saving) || status === undefined || pending || sent} onClick={() => void save(true)}>
            {saving === "circle" || pending ? <Loader2 className="size-4 animate-spin" /> : sent ? <Check className="size-4" /> : <BellRing className="size-4" />}
            {saving === "circle" ? "Saving & requesting alert…" : pending ? "Circle alert queued…" : sent ? "Circle alert sent" : status?.saved ? "Alert circle for this result" : "Add to ledger & alert circle"}
          </Button>
        )}
      </div>
      {status?.saved && (
        <p role="status" className="text-sm text-muted-foreground">
          {status.alertStatus === "not_configured"
            ? "Added to ledger. No circle alert was sent: email alerts are not configured yet. You can retry after setup."
            : status.alertStatus === "no_contacts"
              ? "Added to ledger. No circle alert was sent: add a circle contact with an email address and alerts enabled, then retry."
              : status.alertStatus === "failed" || status.alertStatus === "skipped"
                ? "Added to ledger, but the circle alert was not sent. Check your email setup and enabled circle contacts, then retry."
                : status.alertStatus === "sent"
                  ? "Added to ledger. Alert email accepted for at least one enabled circle contact."
                  : status.alertStatus === "queued"
                    ? "Added to ledger. Your circle alert is queued for delivery."
                    : "Added to ledger. No circle alert was requested."}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Only the result and model details are saved to the ledger; raw audio is not included.
        {aiLike ? " The circle option emails enabled contacts only when you choose it." : " Circle alerts are available for AI-like votes."}
      </p>
    </div>
  );
}
