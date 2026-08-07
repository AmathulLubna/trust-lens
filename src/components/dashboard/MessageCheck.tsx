import { ArchCard, ScoreMeter, VerdictStamp } from "@/components/dashboard/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { fmtClock, fmtDate, type Verdict } from "@/lib/trustlens";
import { cn } from "@/lib/utils";
import { useAction, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Brain,
  History,
  Loader2,
  MessageSquareText,
  RefreshCw,
  ScanLine,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type MessageResult =
  | {
      ok: true;
      sender: string | null;
      textPreview: string;
      riskScore: number;
      heuristicVerdict: Verdict;
      verdict: Verdict;
      confidence: number;
      reasons: string[];
      ai: {
        verdict: Verdict;
        confidence: number;
        explanation: string;
        markers: string[];
        provider: "gemini" | "groq";
      } | null;
      groqConfigured: boolean;
      aiProvider: "gemini" | "groq" | null;
    }
  | { ok: false; message: string };

const SAMPLE_MESSAGES = [
  {
    label: "Normal greeting",
    sender: "+91 98765 43210",
    text: "Hello, how are u?",
  },
  {
    label: "OTP phishing",
    sender: "BX-SBIUPD",
    text: "Dear customer, your SBI KYC will be blocked today. Verify immediately at https://bit.ly/kyc-update and share OTP to reactivate.",
  },
  {
    label: "Family money ask",
    sender: "+91 80900 11223",
    text: "Beta this is Papa. I am in trouble near hospital. Send Rs 25000 on UPI right now and don't tell anyone.",
  },
];

export default function MessageCheck() {
  const runCheck = useAction(api.messageCheck.check);
  const checks = useQuery(api.messages.history);
  const [sender, setSender] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<MessageResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function checkMessage(nextText = text, nextSender = sender) {
    const value = nextText.trim();
    if (!value) return;
    setLoading(true);
    setResult(null);
    try {
      const res = (await runCheck({
        text: value,
        sender: nextSender.trim() || undefined,
      })) as MessageResult;
      setResult(res);
      if (!res.ok) toast.error(res.message);
    } catch {
      setResult({ ok: false, message: "The message check failed - please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="arch-label text-primary">Message scam desk</p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">
          Check SMS and chat messages
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Paste the sender and message. Trust Lens checks random-number context,
          impersonation, money or OTP requests, links, urgency, and AI judgment.
          Gemini is used first when configured, with Groq as fallback.
        </p>
      </div>

      <ArchCard label="Message screening">
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void checkMessage();
          }}
        >
          <Input
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="Sender, e.g. +91 98765 43210 or BX-SBIUPD"
            className="h-11"
            aria-label="Message sender"
          />
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the SMS, WhatsApp text, or money request here..."
            className="min-h-36 resize-y"
            aria-label="Message text"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="arch-label text-muted-foreground">Try:</span>
              {SAMPLE_MESSAGES.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => {
                    setSender(sample.sender);
                    setText(sample.text);
                    void checkMessage(sample.text, sample.sender);
                  }}
                  className="rounded-full border border-border bg-muted/40 px-3 py-1 transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {sample.label}
                </button>
              ))}
            </div>
            <Button type="submit" size="lg" className="gap-2" disabled={loading || !text.trim()}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <MessageSquareText className="size-4" />}
              {loading ? "Checking..." : "Check message"}
            </Button>
          </div>
        </form>
      </ArchCard>

      {result && !result.ok && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-50 px-5 py-4 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {result.message}
        </div>
      )}

      {result && result.ok && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ArchCard
              label="Verdict"
              action={
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void checkMessage()} disabled={loading}>
                  <RefreshCw className="size-3" />
                  Re-check
                </Button>
              }
            >
              <div className="space-y-5 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm text-muted-foreground">
                      {result.sender ?? "Sender not provided"}
                    </p>
                    <p className="mt-1 line-clamp-3 text-sm leading-relaxed">
                      {result.textPreview}
                    </p>
                  </div>
                  <VerdictStamp verdict={result.verdict} />
                </div>
                <ScoreMeter
                  label={`Message risk - AI confidence ${result.confidence}`}
                  value={result.riskScore}
                  toneClass={
                    result.verdict === "flagged"
                      ? "bg-red-500"
                      : result.verdict === "suspicious"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }
                  className="max-w-md"
                />
                {result.reasons.length > 0 ? (
                  <ul className="space-y-2">
                    {result.reasons.map((reason) => (
                      <li key={reason} className="flex items-start gap-2 text-sm">
                        <ScanLine className={cn("mt-0.5 size-4 shrink-0", result.verdict === "flagged" ? "text-red-600" : "text-amber-600")} />
                        <span className="leading-snug">{reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    No scam pattern found. Unknown sender alone is not enough to
                    flag a message.
                  </p>
                )}
              </div>
            </ArchCard>
          </div>

          <div className="space-y-5 lg:col-span-2">
            <ArchCard label="AI opinion">
              <div className="space-y-4 p-5">
                {!result.groqConfigured && (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    Add GEMINI_API_KEY or GROQ_API_KEY to enable the AI second opinion.
                  </p>
                )}
                {result.ai ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <VerdictStamp verdict={result.ai.verdict} />
                      <span className="font-mono text-xs text-muted-foreground">
                        {result.ai.provider} - {result.ai.confidence}/100
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {result.ai.explanation}
                    </p>
                    {result.ai.markers.length > 0 && (
                      <ul className="space-y-1.5">
                        {result.ai.markers.map((marker, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <Brain className="mt-0.5 size-4 shrink-0 text-blue-600" />
                            <span className="leading-snug">{marker}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Pattern scoring completed. AI returned no opinion this time.
                  </p>
                )}
              </div>
            </ArchCard>
          </div>
        </motion.div>
      )}

      <ArchCard label="Recent message checks">
        <div className="p-5">
          {!checks ? (
            <div className="h-14 animate-pulse rounded-xl border border-border bg-muted/40" />
          ) : checks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <History className="size-6 text-muted-foreground" />
              <p className="max-w-sm text-sm text-muted-foreground">
                No message checks yet. Results appear here after each scan.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {checks.map((c: Doc<"messageChecks">) => (
                <li key={c._id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{c.messagePreview}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {c.sender ?? "Unknown sender"} - {fmtDate(c.createdAt)} {fmtClock(c.createdAt)} - risk {c.riskScore}
                    </span>
                  </span>
                  <VerdictStamp verdict={c.verdict} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </ArchCard>

      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-sky-300 bg-sky-50/60 p-4 text-sm leading-relaxed text-muted-foreground dark:border-sky-500/40 dark:bg-sky-500/10">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-sky-600" />
        <p>
          For any message asking for money, OTP, PIN, or identity details,
          verify through a saved trusted contact before acting.
        </p>
      </div>
    </div>
  );
}
