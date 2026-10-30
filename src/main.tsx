import "@vly-ai/integrations";
import { CookieConsent } from "@/components/CookieConsent";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Static route imports: with HMR disabled, the entire module graph is fetched
// once at page load, so route navigation never issues a dynamic import() that
// can fail mid-session ("Failed to fetch dynamically imported module").
import Landing from "./pages/Landing.tsx";
import AuthPage from "./pages/Auth.tsx";
import Dashboard, { LocalDashboard } from "./pages/Dashboard.tsx";
import NotFound from "./pages/NotFound.tsx";
import Privacy from "./pages/Privacy.tsx";
import Voice from "./pages/Voice.tsx";

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

function OptionalAuth({ children }: { children: React.ReactNode }) {
  return convex ? (
    <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>
  ) : (
    children
  );
}

function CloudSetup() {
  return (
    <div className="mx-auto max-w-lg p-10 space-y-4">
      <h1 className="text-xl font-semibold">
        Cloud account features are not configured locally
      </h1>
      <p>Connect your existing Convex deployment to enable live voice and hosted recording checks. See CLOUD_SETUP.md for setup.</p>
      <a className="underline" href="/dashboard?tab=upload&check=voice">
        Open optional local voice detector
      </a>
    </div>
  );
}

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ThemeProvider>
        <ToolbarErrorBoundary>
          <VlyToolbar />
        </ToolbarErrorBoundary>
        <OptionalAuth>
          <BrowserRouter>
            <RouteSyncer />
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/voice" element={<Voice />} />
                <Route
                  path="/auth"
                  element={
                    convex ? (
                      <AuthPage redirectAfterAuth="/dashboard" />
                    ) : (
                      <CloudSetup />
                    )
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    convex ? (
                      <RequireAuth>
                        <Dashboard />
                      </RequireAuth>
                    ) : (
                      <LocalDashboard />
                    )
                  }
                />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <Toaster />
            <CookieConsent />
          </BrowserRouter>
        </OptionalAuth>
      </ThemeProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
