import { ThemeToggle } from "@/components/ThemeToggle";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { TrustLensMark } from "@/components/TrustLensMark";
export default function Landing() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-6">
        <div className="flex items-center gap-3">
          <TrustLensMark className="size-10" />
          <strong>TrustLens</strong>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Button asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          SIH26104 · Voice impersonation research prototype
        </p>
        <h1 className="mt-5 max-w-4xl text-5xl font-bold leading-tight">
          A convincing voice still needs independent verification.
        </h1>
        <p className="mt-6 max-w-3xl text-xl text-muted-foreground">
          Screen consented recordings and nearby microphone audio for possible
          synthetic speech and sensitive requests. TrustLens keeps acoustic
          findings, conversational warnings, and input limitations visible.
        </p>
        <Button className="mt-8" asChild>
          <Link to="/auth">Open screening workspace</Link>
        </Button>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          <article className="rounded-2xl border p-6">
            <h2 className="text-xl font-semibold">Recording analysis</h2>
            <p className="mt-3">
              Authenticated uploads connect to a configured Python acoustic
              service and local transcription. Model outputs are uncalibrated
              and cannot verify a caller's identity.
            </p>
          </article>
          <article className="rounded-2xl border p-6">
            <h2 className="text-xl font-semibold">Microphone coverage</h2>
            <p className="mt-3">
              Six-second audio segments use a bounded queue. Processing failures
              and coverage gaps remain visible. Cellular and WhatsApp remote
              tracks are not directly accessible through this screen.
            </p>
          </article>
          <article className="rounded-2xl border p-6">
            <h2 className="text-xl font-semibold">Pause and verify</h2>
            <p className="mt-3">
              Confirm payment, credential, and approval requests using a
              previously saved contact or your organization's authenticated
              approval route.
            </p>
          </article>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-8 border-t px-6 py-12 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold">Processing and privacy</h2>
          <p className="mt-4">
            Audio passes through temporary server storage to the configured
            acoustic service. Transcript history requires explicit consent and
            defaults off. Audio deletion follows processing, with scheduled
            expiry for abandoned uploads. Deleting history removes associated
            temporary uploads and stored assessments.
          </p>
          <p className="mt-4">
            Optional email alerts require both owner preference and recipient
            verification and consent. Delivery depends on configured services;
            history records its actual status.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold">Current limits</h2>
          <p className="mt-4">
            No independent accuracy benchmark for Indian telephony has been
            established. Hindi and English transcription options and request
            rules need language and channel evaluation. Silence, unavailable
            analysis, and incomplete evidence produce uncertainty.
          </p>
          <p className="mt-4">
            Scripted walkthroughs are labeled and excluded from detection
            history. Number observations have no verified reputation source and
            do not prove fraud. This prototype does not certify authenticity,
            automatically authorize transactions, or intercept every call.
          </p>
        </div>
      </section>
      <footer className="mx-auto max-w-6xl px-6 py-8">
        <Link to="/privacy" className="underline">
          Privacy policy
        </Link>
      </footer>
    </main>
  );
}
