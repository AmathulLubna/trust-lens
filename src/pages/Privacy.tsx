import { ThemeToggle } from "@/components/ThemeToggle";
import { TrustLensMark } from "@/components/TrustLensMark";
import { Button } from "@/components/ui/button";
import { openCookieSettings } from "@/lib/consent";
import { ArrowLeft } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";

/** Optional: set a public privacy contact address. Left empty, the page points to GitHub issues. */
const CONTACT_EMAIL = "";
const ISSUES_URL = "https://github.com/AmathulLubna/trust-lens/issues";
const LAST_UPDATED = "8 October 2026";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

const PROCESSORS: [string, string, string][] = [
  [
    "Convex",
    "Backend, database and sign-in sessions",
    "Your account, ledger, circle, checks and settings",
  ],
  [
    "Configured Python acoustic service",
    "Acoustic screening and local transcription",
    "Consented recordings and microphone segments; deployment-specific processor policies apply",
  ],
  [
    "Configured email services",
    "Sign-in codes and optional alerts",
    "Account email and verified, consented recipients; provider acceptance does not prove delivery",
  ],
  [
    "Website hosting provider",
    "Serves this website",
    "Standard request data, depending on the actual deployment",
  ],
  [
    "Google Fonts",
    "Serves page fonts",
    "Your IP address and browser type when the page loads",
  ],
];

export default function Privacy() {
  useEffect(() => {
    document.title = "Privacy Policy — Trust Lens";
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="paper min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <TrustLensMark className="size-8 text-primary" />
            <span className="font-display text-lg font-semibold tracking-tight">
              Trust Lens
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-4 py-12 sm:px-6">
        <div>
          <p className="arch-label text-primary">Legal · Privacy</p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">
            Privacy Policy
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Trust Lens is a scam and deepfake-voice screening tool. This page
            explains what we collect, why, who processes it, and the controls
            you have. We keep it short and specific to how the app actually
            works.
          </p>
        </div>

        <Section id="collect" title="1. What we collect">
          <List
            items={[
              <>
                <strong className="text-foreground">Account:</strong> your email
                address (and name, if provided) when you sign in with an email
                code, or an anonymous session if you continue as a guest.
              </>,
              <>
                <strong className="text-foreground">Call ledger:</strong> for
                each screened call — time, duration, caller label, assessment,
                acoustic output and reliability limitations, and the warning
                flags raised. The verbatim transcript is saved <em>only</em> if
                you switch on “Archive the transcript”.
              </>,
              <>
                <strong className="text-foreground">
                  Number checks and reports:
                </strong>{" "}
                numbers you check, the verdict and reasons, and any number you
                report (number, category, optional note). Other signed-in users
                can see aggregate report counts. Your notes and reporter
                identifier are private. These reports do not prove fraud.
              </>,
              <>
                <strong className="text-foreground">Message checks:</strong> an
                optional sender label, the assessment and reasons. A message
                preview is retained only with explicit consent.
              </>,
              <>
                <strong className="text-foreground">Alert circle:</strong> name,
                phone, email and relationship of people you add, and whether
                they should be notified. Only add people who are comfortable
                being contacted.
              </>,
              <>
                <strong className="text-foreground">Settings:</strong> your
                alert preferences.
              </>,
            ]}
          />
          <p>
            Consented audio is uploaded to temporary, owner-bound server storage
            and sent to the configured acoustic service for detection and local
            transcription. Audio is deleted after processing; abandoned uploads
            have a scheduled expiry. Transcript retention defaults off and
            requires explicit consent for each recording or session. Acoustic
            output is uncalibrated and does not verify speaker identity.
            Operators must review their service and hosting providers' data
            policies.
          </p>
        </Section>

        <Section id="use" title="2. How we use it">
          <List
            items={[
              "To screen acoustic evidence and contextual requests, display uncertainty, and show community number observations.",
              "To keep your ledger, alert circle and settings, and to send alerts you turn on.",
              "To sign you in and protect your account.",
              "To keep the service working and secure.",
            ]}
          />
          <p>
            We do not sell your data, show ads, or use your content to train AI
            models.
          </p>
        </Section>

        <Section id="processors" title="3. Who processes your data">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead className="bg-muted/50 text-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Provider</th>
                  <th className="px-3 py-2 font-semibold">Purpose</th>
                  <th className="px-3 py-2 font-semibold">Data involved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {PROCESSORS.map(([a, b, c]) => (
                  <tr key={a}>
                    <td className="px-3 py-2 font-medium text-foreground">
                      {a}
                    </td>
                    <td className="px-3 py-2">{b}</td>
                    <td className="px-3 py-2">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            These providers may process data outside your country. We do not
            share your data with anyone else except where the law requires it.
          </p>
        </Section>

        <Section id="cookies" title="4. Cookies and local storage">
          <p>
            Trust Lens uses your browser’s cookies and local storage for the
            items below. There are no advertising or analytics cookies.
          </p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead className="bg-muted/50 text-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 font-semibold">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-3 py-2 font-mono text-foreground">
                    Sign-in session token
                  </td>
                  <td className="px-3 py-2">Essential</td>
                  <td className="px-3 py-2">
                    Keeps you signed in. Removed when you sign out.
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono text-foreground">
                    tl-cookie-consent
                  </td>
                  <td className="px-3 py-2">Essential</td>
                  <td className="px-3 py-2">Remembers your cookie choice.</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-mono text-foreground">
                    tl-theme
                  </td>
                  <td className="px-3 py-2">Preferences (optional)</td>
                  <td className="px-3 py-2">
                    Remembers light / dark / system theme. Only saved if you
                    allow it.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={openCookieSettings}>
            Manage cookie preferences
          </Button>
        </Section>

        <Section id="retention" title="5. Keeping and deleting your data">
          <p>
            Assessment history is retained until you delete it. History deletion
            removes stored assessments, associated checks and pending audio. You
            can remove people from your alert circle at any time, and sign out
            to clear your session. To delete your account and everything linked
            to it, contact us (section 8).
          </p>
        </Section>

        <Section id="rights" title="6. Your rights">
          <p>
            You can ask to access, correct, export or erase your personal data,
            withdraw consent (for example, cookie preferences above), or
            complain about how it is handled. We aim to respond within 30 days.
            Where India’s Digital Personal Data Protection Act, 2023 or the GDPR
            applies to you, these rights follow from those laws.
          </p>
        </Section>

        <Section id="security" title="7. Security and children">
          <p>
            Data is transmitted over HTTPS and stored with our backend provider.
            No system is perfectly secure, so please treat Trust Lens as a
            warning aid and not as proof. Trust Lens is not intended for anyone
            under 18.
          </p>
        </Section>

        <Section id="contact" title="8. Contact and changes">
          <p>
            Questions or requests:{" "}
            {CONTACT_EMAIL ? (
              <a
                className="text-primary underline underline-offset-2"
                href={`mailto:${CONTACT_EMAIL}`}
              >
                {CONTACT_EMAIL}
              </a>
            ) : (
              <a
                className="text-primary underline underline-offset-2"
                href={ISSUES_URL}
                target="_blank"
                rel="noreferrer"
              >
                open a general issue on GitHub
              </a>
            )}
            . Do not post recordings, account identifiers or other private data
            in public issues. A private contact channel must be configured by
            the operator before accepting private account requests. If we change
            this policy, we will update the date above, and ask again for
            consent where the law requires it.
          </p>
        </Section>
      </main>
    </div>
  );
}
