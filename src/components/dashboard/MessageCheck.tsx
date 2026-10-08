import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { VerdictStamp } from "./shared";
import type { Verdict } from "@/lib/trustlens";
export default function MessageCheck() {
  const check = useAction(api.messageCheck.check);
  const [text, setText] = useState("");
  const [retain, setRetain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    verdict: Verdict;
    reasons: string[];
    summary: string;
  } | null>(null);
  const [error, setError] = useState("");
  async function run() {
    setBusy(true);
    setError("");
    try {
      const response = await check({ text, retainText: retain });
      if (response.ok) setResult(response);
      else setError(response.message);
    } catch {
      setResult({
        verdict: "analysis_unavailable",
        reasons: [],
        summary:
          "Message screening is unavailable. Verify sensitive requests independently.",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">Message request screening</h1>
      <p>
        Check request and pressure patterns in English, Hindi, and Hinglish.
        These limited rules do not prove fraud or sender identity.
      </p>
      <textarea
        aria-label="Message"
        className="block min-h-40 w-full rounded border p-3"
        maxLength={5000}
        value={text}
        disabled={busy}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
      />
      <label className="block">
        <input
          type="checkbox"
          checked={retain}
          disabled={busy}
          onChange={(e) => setRetain(e.target.checked)}
        />{" "}
        Save a message preview in history (optional; off by default).
      </label>
      <Button disabled={busy || !text.trim()} onClick={() => void run()}>
        Check message
      </Button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div aria-live="polite">
          <VerdictStamp verdict={result.verdict} />
          <p>{result.summary}</p>
          <ul>
            {result.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
