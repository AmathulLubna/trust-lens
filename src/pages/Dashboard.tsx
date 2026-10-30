import Circle from "@/components/dashboard/Circle";
import History from "@/components/dashboard/History";
import LiveGuard from "@/components/dashboard/LiveGuard";
import MessageCheck from "@/components/dashboard/MessageCheck";
import NumberCheck from "@/components/dashboard/NumberCheck";
import Overview from "@/components/dashboard/Overview";
import Settings from "@/components/dashboard/Settings";
import UploadCheck from "@/components/dashboard/UploadCheck";
import { TrustLensMark } from "@/components/TrustLensMark";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  AudioLines,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  ScrollText,
  Search,
  Settings as SettingsIcon,
  Upload,
  Users,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

type Tab =
  | "overview"
  | "guard"
  | "upload"
  | "number"
  | "message"
  | "history"
  | "circle"
  | "settings";

const NAV: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "guard", label: "Live Guard", icon: AudioLines },
  { id: "upload", label: "Upload Check", icon: Upload },
  { id: "number", label: "Number Check", icon: Search },
  { id: "message", label: "Message Check", icon: MessageSquareText },
  { id: "history", label: "Call Ledger", icon: ScrollText },
  { id: "circle", label: "Alert Circle", icon: Users },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch {
      navigate("/");
    }
  };

  return <DashboardView user={user} onExit={() => void handleSignOut()} />;
}

export function LocalDashboard() {
  const navigate = useNavigate();
  return (
    <DashboardView
      localOnly
      user={{ name: "Offline preview", email: "Convex connection not configured" }}
      onExit={() => navigate("/")}
    />
  );
}

function DashboardView({
  localOnly = false,
  user,
  onExit,
}: {
  localOnly?: boolean;
  user?: { name?: string | null; email?: string | null } | null;
  onExit: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const selected = params.get("tab");
  const tab: Tab =
    NAV.find((item) => item.id === selected)?.id ??
    (localOnly ? "upload" : "overview");
  const setTab = (next: Tab) =>
    setParams((previous) => {
      const updated = new URLSearchParams(previous);
      updated.set("tab", next);
      return updated;
    });
  const currentTitle = NAV.find((item) => item.id === tab)!.label;

  return (
    <div className="paper min-h-screen">
      <div className="flex">
        {/* ── Desktop sidebar ─────────────────────────── */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
          <div className="flex items-center gap-3 border-b border-border/70 px-5 py-5">
            <TrustLensMark className="size-9 text-primary" />
            <div>
              <p className="font-display text-base font-semibold tracking-tight">
                Trust Lens
              </p>
              <p className="text-[11px] text-muted-foreground">
                Deepfake voice detection
              </p>
            </div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setTab(n.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  tab === n.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <n.icon className="size-4" />
                {n.label}
              </button>
            ))}
          </nav>
          <div className="border-t border-border/70 p-3">
            <div className="flex items-center gap-3 rounded-xl px-2 py-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {(user?.name ?? user?.email ?? "G").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {user?.name ?? "Guest"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {user?.email ?? "Anonymous session"}
                </p>
              </div>
              <button
                type="button"
                onClick={onExit}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-destructive"
                aria-label={localOnly ? "Back to home" : "Sign out"}
                title={localOnly ? "Back to home" : "Sign out"}
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* ── Main column ─────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* mobile top bar */}
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:hidden">
            <div className="flex items-center gap-2.5">
              <TrustLensMark className="size-7 text-primary" />
              <span className="font-display font-semibold tracking-tight">
                Trust Lens
              </span>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
            >
              <LogOut className="size-3.5" />
              {localOnly ? "Home" : "Sign out"}
            </button>
          </header>

          <main className="flex-1 px-4 pb-40 pt-6 sm:px-6 md:pb-12 md:pt-8">
            <div className="mx-auto max-w-5xl">
              {localOnly && (
                <p className="mb-5 rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                  Convex is not connected. Hosted live voice and transcript checks
                  need a backend connection. The local voice model is optional.
                </p>
              )}
              {localOnly && tab !== "upload" && (
                <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
                  <h1 className="font-display text-2xl font-semibold">
                    {currentTitle}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {tab === "overview"
                      ? "Connect your Convex backend to use live voice and hosted checks. Upload Check also includes an optional local voice model."
                      : `${currentTitle} uses your TrustLens account and the existing cloud backend, which is not configured in this local preview.`}
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm font-medium">
                    <button
                      type="button"
                      className="text-primary underline"
                      onClick={() => setTab("upload")}
                    >
                      Go to Upload Check
                    </button>
                    <a
                      className="text-primary underline"
                      href={`https://trustlens-vmeg.vercel.app/dashboard?tab=${tab}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open {currentTitle} on hosted TrustLens
                    </a>
                  </div>
                </section>
              )}
              {!localOnly && tab === "overview" && (
                <Overview
                  onNavigate={(t) =>
                    setTab(
                      t === "history"
                        ? "history"
                        : t === "circle"
                          ? "circle"
                          : t === "number"
                            ? "number"
                            : "guard",
                    )
                  }
                />
              )}
              {!localOnly && tab === "guard" && <LiveGuard />}
              {tab === "upload" && <UploadCheck localOnly={localOnly} />}
              {!localOnly && tab === "number" && <NumberCheck />}
              {!localOnly && tab === "message" && <MessageCheck />}
              {!localOnly && tab === "history" && <History />}
              {!localOnly && tab === "circle" && <Circle />}
              {!localOnly && tab === "settings" && <Settings />}
            </div>
          </main>
        </div>
      </div>

      {/* ── Mobile bottom nav ────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-4">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setTab(n.id)}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                tab === n.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <n.icon className="size-5" />
              {n.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
