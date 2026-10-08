import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { REPORT_CATEGORIES } from "@/lib/numbers";
import { Button } from "@/components/ui/button";
export default function NumberCheck() {
  const lookup = useAction(api.numberLookup.lookup);
  const report = useMutation(api.numbers.reportNumber);
  const [number, setNumber] = useState("");
  const [category, setCategory] = useState("scam-call");
  const [note, setNote] = useState("");
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function check() {
    setCounts(null);
    setBusy(true);
    try {
      const result = await lookup({ number });
      if (result.ok) {
        setCounts(result.counts);
        setMessage(
          "No verified reputation information. These are unmoderated reports; neither a report nor caller ID proves identity." +
            (result.truncated ? " Showing at most 100 reports." : ""),
        );
      } else setMessage(result.message);
    } catch {
      setMessage("Lookup unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    try {
      await report({ number, display: number, category, note });
      setMessage(
        "Your observation was saved. Private notes are accessible only to your account.",
      );
    } catch {
      setMessage("Report failed; check the number and note length.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">Number observations</h1>
      <p>
        There is no verified scam-number database configured. Digit patterns and
        promotional number ranges do not establish fraud. Legitimate reports are
        counted separately.
      </p>
      <input
        aria-label="Phone number"
        value={number}
        onChange={(e) => {
          setNumber(e.target.value);
          setCounts(null);
        }}
        className="rounded border p-2"
      />
      <Button onClick={() => void check()} disabled={busy}>
        Check observations
      </Button>
      <p role="status">{message}</p>
      {counts && (
        <ul>
          {Object.entries(counts).map(([key, count]) => (
            <li key={key}>
              {key}: {count} unverified observations
            </li>
          ))}
        </ul>
      )}
      <label className="block">
        Report category{" "}
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {REPORT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Private note{" "}
        <textarea
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="block w-full rounded border p-2"
        />
      </label>
      <Button disabled={busy || !number.trim()} onClick={() => void submit()}>
        Save observation
      </Button>
    </div>
  );
}
