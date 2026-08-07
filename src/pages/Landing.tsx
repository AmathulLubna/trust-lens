import { VerdictStamp } from "@/components/dashboard/shared";
import { Button } from "@/components/ui/button";
import { TrustLensMark } from "@/components/TrustLensMark";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { motion } from "framer-motion";
import {
  ArrowRight,
  AudioLines,
  BadgeCheck,
  BellRing,
  Brain,
  Eye,
  Flag,
  Phone,
  ScanLine,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  Vibrate,
} from "lucide-react";
import { Link } from "react-router";

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: "easeOut" as const },
};

const DIALOGUE = [
  { speaker: "caller", text: "Beta, sunn lo… it's Amma! Main musibat mein hoon." },
  { speaker: "caller", text: "Hospital needs ₹40,000 right now. UPI bhej do." },
  { speaker: "caller", text: "Aur Papa ko mat batana, bas hum dono mein." },
];

const FLAGS = [
  { label: "Voice clone confidence", value: "87%", tone: "text-red-600" },
  { label: "Urgency language", value: "detected", tone: "text-red-600" },
  { label: "Money / UPI request", value: "detected", tone: "text-red-600" },
  { label: "Secrecy pressure", value: "detected", tone: "text-red-600" },
];

const FAQ = [
  {
    q: "How does Trust Lens tell a cloned voice from a real one?",
    a: "Human voices are imperfect in ways machines rarely are. Trust Lens measures pitch jitter (the natural shakiness of the vocal folds), prosody flatness, and spectral artifacts. Voice-clone pipelines typically land far outside the human range on several of these at once — that combination is the signal.",
  },
  {
    q: "Does it work on live calls and voice notes?",
    a: "The web app screens live microphone audio right now, and the roadmap adds an Android layer that taps the call audio stream for both regular calls and WhatsApp voice calls. The same two agents run, and the same verdicts come back.",
  },
  {
    q: "What happens when something is flagged?",
    a: "You get a clear mid-call banner — “Possible voice clone + scam pattern detected” — with a distinct vibration pattern and one next step: verify through a separate channel before acting. If an alert circle is set up, the right people are notified automatically.",
  },
  {
    q: "Does it record conversations?",
    a: "No, not by default. Analysis runs on-device and scores are saved; transcripts are stored only if you explicitly opt in, and you can wipe the whole ledger with one tap.",
  },
  {
    q: "Is this a certified forensic tool?",
    a: "No — and we won't pretend otherwise. Trust Lens is a warning system. It buys you the two seconds that stop the transfer, and it nudges you to verify. Final judgment stays with your people.",
  },
  {
    q: "Who is this built for?",
    a: "Teams. Fraud desks, support lines, and finance teams who take urgent calls and voice instructions — any workspace where a convincing voice can move money or decisions. It's built for internal use first, with a family deployment on the roadmap.",
  },
  {
    q: "Can I check a phone number before calling it back?",
    a: "Yes — the Number Check desk screens any number against pattern heuristics, your team's shared reports, and a Groq second opinion. It's the fastest way to sanity-check a missed call or an SMS sender before you engage, and reporting a suspicious number protects the whole team instantly.",
  },
  {
    q: "Does the live voice check really use AI in real time?",
    a: "It runs two engines at once: on-device acoustics score pitch jitter, prosody flatness and spectral artifacts continuously, while Groq Whisper transcribes each few seconds of speech and an LLM cross-checks the features and content together. The verdict refreshes automatically as the conversation develops.",
  },
];

export default function Landing() {
  return (
    <div className="paper min-h-screen">
      {/* ── Masthead ─────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <TrustLensMark className="size-9 text-primary" />
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">
              Trust Lens
            </span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {[
              ["The Threat", "#threat"],
              ["How it Works", "#how"],
              ["Live Demo", "#demo"],
              ["Number Check", "#number"],
              ["Team Alerts", "#circle"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/auth?returnTo=/dashboard">Sign in</Link>
            </Button>
            <Button asChild className="gap-2">
              <Link to="/auth?returnTo=/dashboard">
                Open the console
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="mx-auto max-w-3xl text-center"
          >
            <div className="mb-6 flex items-center justify-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3.5 py-1.5 text-xs font-semibold text-primary">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                Deepfake voice detection
              </span>
              <span className="arch-label text-muted-foreground">
                Internal · Team access
              </span>
            </div>
            <h1 className="font-display text-4xl font-bold leading-[1.06] tracking-tight text-foreground sm:text-6xl">
              A voice is no longer proof.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              A three-second clip of a voice is all it takes to clone it — and
              scammers are using it to move money. Trust Lens scans calls and
              voice notes for AI-generated speech, flags scam patterns in real
              time, and alerts your team before anyone acts.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full gap-2 sm:w-auto">
                <Link to="/auth?returnTo=/dashboard">
                  <ShieldCheck className="size-5" />
                  Open the console
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
              >
                <a href="#demo">See it flag a clone</a>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
              {["Voice authenticity agent", "Scam-pattern agent", "Number screening", "Instant team alerts"].map(
                (chip) => (
                  <span key={chip} className="flex items-center gap-2">
                    <BadgeCheck className="size-4 text-emerald-600" />
                    {chip}
                  </span>
                ),
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Live demo showcase ───────────────────────────── */}
      <section id="demo" className="relative mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <motion.div
          {...fadeUp}
          className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-border bg-card shadow-[0_24px_60px_-32px_rgba(21,23,34,0.28)]"
        >
          <div className="flex flex-col gap-3 border-b border-border/80 bg-muted/40 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="arch-label text-muted-foreground">
              Sample case · the “Amma” scam call
            </span>
            <span className="arch-label flex items-center gap-2 text-rose-600">
              <span className="size-1.5 animate-pulse rounded-full bg-rose-500" />
              Live analysis
            </span>
          </div>
          <div className="grid gap-0 md:grid-cols-[320px_1fr]">
            {/* phone mock */}
            <div className="flex flex-col items-center border-b border-border/80 bg-slate-950 px-6 py-8 md:border-r md:border-b-0">
              <div className="w-full max-w-[230px] rounded-[1.75rem] border border-slate-700 bg-slate-900 p-3 shadow-2xl">
                <div className="flex items-center justify-between px-2 pt-1 text-[10px] text-slate-400">
                  <span>14:02</span>
                  <span className="flex items-center gap-1">
                    <SignalIcon /> <span>LTE</span>
                  </span>
                </div>
                <div className="mt-4 flex flex-col items-center gap-3 pb-5">
                  <div className="relative flex size-20 items-center justify-center rounded-full border border-blue-400/60">
                    <span className="radar-sweep absolute inset-0 rounded-full border border-dashed border-blue-400/40" />
                    <Eye className="size-8 text-slate-100" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-slate-100">Amma (Mother)</p>
                    <p className="font-mono text-[10px] text-slate-400">
                      +91 98••••••21 · WhatsApp call
                    </p>
                  </div>
                  <span className="stamp text-red-400">
                    Flagged · possible clone
                  </span>
                </div>
                <div className="mb-2 flex items-center justify-center gap-8 rounded-xl bg-slate-950 py-3">
                  <Phone className="size-5 text-red-400" />
                  <Vibrate className="size-5 text-amber-400" />
                  <ShieldAlert className="size-5 animate-pulse text-red-400" />
                </div>
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-center text-[11px] leading-snug text-red-200">
                  Verify via a separate channel before sending any money.
                </p>
              </div>
            </div>
            {/* readout */}
            <div className="px-6 py-7 sm:px-8">
              <p className="arch-label text-muted-foreground">
                Agent readout · t+0:08
              </p>
              <div className="mt-4 space-y-3">
                {FLAGS.map((f) => (
                  <div
                    key={f.label}
                    className="flex items-center justify-between border-b border-dashed border-border/70 pb-3"
                  >
                    <span className="text-sm">{f.label}</span>
                    <span
                      className={`font-mono text-sm font-semibold tracking-wide ${f.tone}`}
                    >
                      {f.value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <span className="arch-label text-muted-foreground">
                    Combined risk
                  </span>
                  <span className="font-display text-2xl font-bold text-red-600">
                    87<span className="text-sm">/100</span>
                  </span>
                </div>
                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: "87%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.1, ease: "easeOut" }}
                    className="h-full rounded-full bg-red-500"
                  />
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-4">
                <p className="arch-label mb-2 text-muted-foreground">
                  Verbatim transcript (excerpt)
                </p>
                <div className="space-y-2">
                  {DIALOGUE.map((d, i) => (
                    <p key={i} className="text-sm leading-relaxed text-foreground/85">
                      <span className="font-mono text-xs font-semibold text-primary">
                        CALLER
                      </span>
                      <span className="ml-2 italic">“{d.text}”</span>
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Number screening desk ───────────────────────── */}
      <section id="number" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div {...fadeUp}>
            <span className="arch-label text-primary">Number screening desk</span>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Check the number before it calls you.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              Spoofed caller ID is one of the cheapest tools in the scammer's
              kit. Paste any number — a missed call, an SMS sender, a WhatsApp
              contact — and the desk weighs pattern heuristics, your team's
              shared reports, and a Groq second opinion into one clear verdict.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
              {[
                "140-series telemarketing ranges and burner-SIM patterns",
                "Every teammate's reports feed one shared knowledge base",
                "Report a number in two taps — the whole team sees it",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>
            <Button asChild className="mt-7 gap-2">
              <Link to="/auth?returnTo=/dashboard">
                <Search className="size-4" />
                Open the screening desk
              </Link>
            </Button>
          </motion.div>
          <motion.div {...fadeUp}>
            <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-6 shadow-[0_20px_55px_-32px_rgba(21,23,34,0.28)]">
              <p className="arch-label text-muted-foreground">Screening · sample result</p>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                <Search className="size-4 text-muted-foreground" />
                <span className="flex-1 font-mono text-sm">+91 76000 98765</span>
                <span className="arch-label text-primary">Checked</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="font-mono text-lg font-semibold tracking-tight">
                  +91 76000 98765
                </span>
                <VerdictStamp verdict="flagged" />
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <span className="arch-label text-muted-foreground">Risk score</span>
                  <span className="font-mono text-sm font-semibold">
                    82<span className="text-[10px] text-muted-foreground">/100</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: "82%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full rounded-full bg-red-500"
                  />
                </div>
              </div>
              <div className="mt-4 space-y-2.5">
                {[
                  ["Knowledge base", "KYC update scam"],
                  ["Team reports", "3 teammates — scam-call"],
                  ["AI opinion", "flagged · confidence 88/100"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-dashed border-border/70 pb-2.5">
                    <span className="text-sm">{k}</span>
                    <span className="font-mono text-xs font-semibold text-red-600">{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-50 px-3 py-2.5 text-xs leading-snug text-emerald-700 dark:bg-emerald-500/10">
                <Flag className="size-4 shrink-0" />
                Report suspicious numbers so the whole team screens faster.
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Stats band ───────────────────────────────────── */}
      <section className="border-y border-border bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-10 px-6 py-14 md:grid-cols-4">
          {[
            ["₹120 Cr+", "lost to voice-clone scams in India, 2024", "text-blue-600"],
            ["3 seconds", "of audio needed to clone a voice", "text-sky-600"],
            ["< 2 seconds", "from speech onset to a verdict", "text-emerald-600"],
            ["1 tap", "routes an alert to your team", "text-amber-600"],
          ].map(([n, d, c]) => (
            <div key={n} className="px-2 text-center">
              <p className={`numeral text-4xl font-bold ${c}`}>{n}</p>
              <p className="mx-auto mt-2 max-w-[220px] text-sm leading-snug text-muted-foreground">
                {d}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── The Threat ───────────────────────────────────── */}
      <section id="threat" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div {...fadeUp}>
            <span className="arch-label text-primary">The threat</span>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              The voice on the line
              <br />
              is no longer proof of family.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              Scammers harvest 3–10 second clips of a relative's voice from
              WhatsApp statuses and social media, then call with a perfect
              clone: <em>“Beta, I'm in trouble — send money now.”</em> The
              victim isn't careless. The voice simply sounds like family, and
              caller ID is meaningless when the number itself is spoofed.
            </p>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Elderly users are hit hardest — trusted voices bypass every guard
              they know. There is currently no consumer defence that listens to
              the call itself.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                ["urgency", "Emergency framing and manufactured time pressure"],
                ["money", "UPI / OTP / bank transfers demanded immediately"],
                ["secrecy", "“Don't tell anyone else in the family”"],
                ["relation", "Claims closeness the caller ID cannot prove"],
              ].map(([k, v]) => (
                <li key={k} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                    {k}
                  </span>
                  <span className="pt-0.5 text-muted-foreground">{v}</span>
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div {...fadeUp}>
            <div className="rounded-3xl border border-border bg-card p-7 shadow-[0_20px_55px_-32px_rgba(21,23,34,0.28)]">
              <p className="arch-label text-muted-foreground">
                A typical script, flagged line by line
              </p>
              <div className="mt-4 space-y-4">
                {[
                  {
                    line: "Beta, main musibat mein hoon — accident ho gaya.",
                    flag: "Urgency + claimed relation",
                  },
                  {
                    line: "Hospital ₹40,000 maang raha hai. Abhi bhej do.",
                    flag: "Money demand, time pressure",
                  },
                  {
                    line: "Papa ko mat batana. Bas tum aur main.",
                    flag: "Secrecy pressure",
                  },
                ].map(({ line, flag }) => (
                  <div
                    key={line}
                    className="rounded-2xl border border-border/80 bg-muted/40 p-4"
                  >
                    <p className="text-sm italic leading-relaxed">
                      “{line}”
                    </p>
                    <p className="arch-label mt-2 flex items-center gap-1.5 text-red-600">
                      <ScanLine className="size-3" />
                      {flag}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                Each of these markers is individually harmless. Together — with
                a synthetic-sounding voice — they are the fingerprint of a
                cloning scam.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section id="how" className="border-y border-border bg-white py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
            <span className="arch-label text-primary">How it works</span>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Three agents. One second's notice.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Two analysis engines run in parallel on every screened call; a
              third decides what your team sees and feels.
            </p>
          </motion.div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                n: "01",
                icon: AudioLines,
                tint: "bg-blue-50 text-blue-600",
                title: "The Interceptor",
                body: "Taps the live audio stream — phone or WhatsApp — and chops it into 400 ms windows. Nothing leaves your device unless you opt in.",
                tags: ["Live audio", "Edge-first"],
              },
              {
                n: "02",
                icon: Brain,
                tint: "bg-sky-50 text-sky-600",
                title: "The Voice & Scam Agents",
                body: "One agent hunts acoustic artifacts — pitch jitter, spectral quirks, prosody flatness — with a Groq cross-check on borderline voices. The other transcribes live via Whisper and reads the words for scam patterns: urgency, money, secrecy.",
                tags: ["< 2s verdict", "Live AI cross-check"],
              },
              {
                n: "03",
                icon: BellRing,
                tint: "bg-emerald-50 text-emerald-600",
                title: "The Alerter",
                body: "A clean banner, a distinct vibration, and one clear instruction — verify separately before acting. Critical calls alert your circle automatically.",
                tags: ["Mid-call", "Team notified"],
              },
            ].map((c, i) => (
              <motion.div
                key={c.n}
                {...fadeUp}
                transition={{ duration: 0.55, delay: i * 0.1, ease: "easeOut" }}
                className="group relative overflow-hidden rounded-2xl border border-border bg-background p-7 transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_18px_44px_-28px_rgba(37,99,235,0.3)]"
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`flex size-11 items-center justify-center rounded-xl ${c.tint} transition-transform group-hover:scale-110`}
                  >
                    <c.icon className="size-5" />
                  </span>
                  <span className="font-display text-3xl font-bold text-muted-foreground/20 transition-colors group-hover:text-primary/40">
                    {c.n}
                  </span>
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {c.body}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {c.tags.map((t) => (
                    <span
                      key={t}
                      className="arch-label rounded-full border border-border bg-muted/50 px-2.5 py-1 text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Team alerts ──────────────────────────────────── */}
      <section id="circle" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div {...fadeUp} className="order-2 lg:order-1">
            <div className="mx-auto max-w-sm rounded-3xl border border-border bg-card p-6 shadow-[0_20px_55px_-32px_rgba(21,23,34,0.28)]">
              <p className="arch-label text-muted-foreground">
                Team alert · flagged call
              </p>
              <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    R
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Rohan · Finance desk</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      14:02 · via Trust Lens alert
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 rounded-xl bg-card p-3 text-sm">
                  <p className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-red-600" />
                    <span>
                      <strong>Amma (sample case)</strong> hit a flagged call
                    </span>
                  </p>
                  <p className="pl-6 text-muted-foreground">
                    Possible voice clone + urgency scam pattern.
                  </p>
                  <p className="pl-6 text-[13px] text-muted-foreground">
                    Suggested: call back on the saved number.
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Privacy-preserving: your circle sees who, when, and the verdict —
                never a full transcript without consent.
              </p>
            </div>
          </motion.div>
          <motion.div {...fadeUp} className="order-1 lg:order-2">
            <span className="arch-label text-primary">Team alerts</span>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              When a voice can't be trusted,
              <br />
              the right person knows in seconds.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              Add the people who should hear about a risky call — a fraud desk,
              a support lead, a finance teammate. The moment a call is flagged,
              they're alerted with a clear suggested action, not just a warning.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
              {[
                "Automatic alerts the second a verdict lands",
                "Works for the relatives who never asked for an app",
                "One tap to verify against a known, saved number",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Users className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ── Testimonial ──────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
        <motion.figure {...fadeUp} className="text-center">
          <span className="font-display text-6xl leading-none text-primary/30">
            “
          </span>
          <blockquote className="mt-2 text-2xl leading-relaxed font-medium text-foreground sm:text-3xl">
            An exec's “voice” called our finance team asking for an urgent
            transfer. Trust Lens flagged it as synthetic in under two seconds —
            the transfer never went through.
          </blockquote>
          <figcaption className="arch-label mt-6 text-muted-foreground">
            — Finance lead · internal pilot
          </figcaption>
        </motion.figure>
      </section>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-6">
        <motion.div {...fadeUp} className="mb-10 text-center">
          <span className="arch-label text-primary">The record</span>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight">
            Questions, answered plainly
          </h2>
        </motion.div>
        <Accordion type="single" collapsible className="w-full">
          {FAQ.map((f, i) => (
            <AccordionItem key={f.q} value={`faq-${i}`}>
              <AccordionTrigger className="text-left text-base font-medium">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* ── Final CTA ────────────────────────────────────── */}
      <section className="px-4 pb-24 sm:px-6">
        <motion.div
          {...fadeUp}
          className="paper-heavy relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-blue-600 px-6 py-16 text-center text-white shadow-[0_30px_70px_-30px_rgba(37,99,235,0.45)] sm:py-20"
        >
          <div className="pointer-events-none absolute -left-10 -top-10 size-44 rounded-full border border-white/15" />
          <div className="pointer-events-none absolute -bottom-16 -right-8 size-56 rounded-full border border-white/10" />
          <span className="arch-label text-blue-100/90">Before the next call</span>
          <h2 className="mx-auto mt-4 max-w-2xl font-display text-3xl font-bold leading-tight sm:text-5xl">
            Verify before you act.{" "}
            <span className="text-blue-50">The two seconds that stop the transfer.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-blue-50/90">
            Set up your team's guard in under a minute. Works on phone and
            WhatsApp calls — and it never needs to record a word.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 gap-2 bg-white text-blue-700 hover:bg-blue-50"
          >
            <Link to="/auth?returnTo=/dashboard">
              Open the console
              <ArrowRight className="size-5" />
            </Link>
          </Button>
        </motion.div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-border bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div>
              <div className="flex items-center gap-3">
                <TrustLensMark className="size-8 text-primary" />
                <span className="font-display text-lg font-semibold tracking-tight">
                  Trust Lens
                </span>
              </div>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Deepfake voice detection and scam alerts for your team — on
                phone and WhatsApp.
              </p>
            </div>
            <div className="flex gap-12">
              <div>
                <p className="arch-label mb-3 text-muted-foreground">Product</p>
                <ul className="space-y-2 text-sm text-foreground/80">
                  <li>
                    <a href="#threat" className="hover:underline">
                      The Threat
                    </a>
                  </li>
                  <li>
                    <a href="#how" className="hover:underline">
                      How it Works
                    </a>
                  </li>
                  <li>
                    <a href="#circle" className="hover:underline">
                      Team Alerts
                    </a>
                  </li>
                  <li>
                    <a href="#number" className="hover:underline">
                      Number Check
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <p className="arch-label mb-3 text-muted-foreground">Console</p>
                <ul className="space-y-2 text-sm text-foreground/80">
                  <li>
                    <Link to="/auth?returnTo=/dashboard" className="hover:underline">
                      Open the console
                    </Link>
                  </li>
                  <li>
                    <Link to="/auth" className="hover:underline">
                      Sign in
                    </Link>
                  </li>
                  <li>
                    <a
                      href="/trust-lens.zip"
                      download="trust-lens.zip"
                      className="hover:underline"
                    >
                      Download source (zip)
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="rule-divider mt-10 text-xs text-muted-foreground">
            <span className="arch-label">Trust Lens</span>
            <span className="arch-label">Verify by design</span>
            <span className="arch-label">Not a forensic tool — a warning system</span>
          </div>
          <p className="mt-4 text-xs text-muted-foreground/80">
            © 2026 Trust Lens. Analysis runs on-device; transcripts stored only
            with your explicit consent.
          </p>
        </div>
      </footer>
    </div>
  );
}

function SignalIcon() {
  return (
    <span className="flex items-end gap-[2px]">
      {[3, 5, 7].map((h) => (
        <span
          key={h}
          className="w-[3px] rounded-sm bg-current"
          style={{ height: h }}
        />
      ))}
    </span>
  );
}
