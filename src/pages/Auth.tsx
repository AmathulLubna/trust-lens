import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { TrustLensMark } from "@/components/TrustLensMark";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, Loader2, Mail, UserX } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send verification code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("The verification code you entered is incorrect.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (error) {
      console.error("Guest login error:", error);
      setError(
        `Failed to sign in as guest: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="paper flex min-h-screen flex-col">
      {/* Wordmark */}
      <header className="flex items-center justify-between px-5 py-5">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5"
        >
          <TrustLensMark className="size-8 text-primary" />
          <span className="font-display text-lg font-semibold tracking-tight">
            Trust Lens
          </span>
        </button>
        <span className="arch-label hidden text-muted-foreground sm:block">
          Deepfake voice detection · Internal
        </span>
      </header>

      {/* Auth Content */}
      <div className="flex flex-1 items-center justify-center px-4 pb-14">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-card shadow-[0_28px_70px_-36px_rgba(21,23,34,0.3)] lg:grid-cols-2">
          {/* Brand panel */}
          <div className="paper-heavy relative hidden flex-col justify-between bg-blue-600 p-10 text-white lg:flex">
            <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full border border-white/10" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 size-64 rounded-full border border-white/10" />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-semibold backdrop-blur">
                <span className="size-1.5 animate-pulse rounded-full bg-white" />
                Live screening
              </span>
              <h2 className="mt-6 font-display text-3xl font-bold leading-tight">
                A voice is no longer proof.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-blue-50/90">
                Trust Lens scans calls and voice notes for AI-generated speech,
                flags scam patterns in real time, and alerts your team before
                anyone acts.
              </p>
            </div>
            <div className="relative space-y-3 text-sm text-blue-50/90">
              {[
                "Voice authenticity in under 2 seconds",
                "Scam-pattern detection in parallel",
                "One-tap alerts to your circle",
              ].map((item) => (
                <p key={item} className="flex items-center gap-2.5">
                  <span className="flex size-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                    ✓
                  </span>
                  {item}
                </p>
              ))}
            </div>
          </div>

          {/* Form */}
          <div className="flex flex-col justify-center">
            {step === "signIn" ? (
              <>
                <CardHeader className="text-center">
                  <div className="mb-3 flex justify-center lg:hidden">
                    <TrustLensMark className="size-12 text-primary" />
                  </div>
                  <CardTitle className="font-display text-2xl font-bold tracking-tight">
                    Enter the console
                  </CardTitle>
                  <CardDescription>
                    Your email logs you in or creates your workspace
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleEmailSubmit}>
                  <CardContent>
                    <div className="relative flex items-center gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          name="email"
                          placeholder="name@example.com"
                          type="email"
                          className="pl-9"
                          disabled={isLoading}
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="outline"
                        size="icon"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowRight className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {error && (
                      <p className="mt-2 text-sm text-rose-600">{error}</p>
                    )}

                    <div className="mt-4">
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="arch-label bg-card px-2 text-muted-foreground">
                            Or
                          </span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 w-full"
                        onClick={handleGuestLogin}
                        disabled={isLoading}
                      >
                        <UserX className="mr-2 h-4 w-4" />
                        Continue as Guest
                      </Button>
                    </div>
                  </CardContent>
                </form>
              </>
            ) : (
              <>
                <CardHeader className="mt-4 text-center">
                  <CardTitle>Check your email</CardTitle>
                  <CardDescription>
                    We've sent a code to {step.email}
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleOtpSubmit}>
                  <CardContent className="pb-4">
                    <input type="hidden" name="email" value={step.email} />
                    <input type="hidden" name="code" value={otp} />

                    <div className="flex justify-center">
                      <InputOTP
                        value={otp}
                        onChange={setOtp}
                        maxLength={6}
                        disabled={isLoading}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            otp.length === 6 &&
                            !isLoading
                          ) {
                            const form = (e.target as HTMLElement).closest(
                              "form",
                            );
                            if (form) form.requestSubmit();
                          }
                        }}
                      >
                        <InputOTPGroup>
                          {Array.from({ length: 6 }).map((_, index) => (
                            <InputOTPSlot key={index} index={index} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    {error && (
                      <p className="mt-2 text-center text-sm text-rose-600">
                        {error}
                      </p>
                    )}
                    <p className="mt-4 text-center text-sm text-muted-foreground">
                      Didn't receive a code?{" "}
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => setStep("signIn")}
                      >
                        Try again
                      </Button>
                    </p>
                  </CardContent>
                  <CardFooter className="flex-col gap-2">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading || otp.length !== 6}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          Verify code
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setStep("signIn")}
                      disabled={isLoading}
                      className="w-full"
                    >
                      Use different email
                    </Button>
                  </CardFooter>
                </form>
              </>
            )}

            <div className="border-t bg-muted/40 px-6 py-3 text-center">
              <p className="arch-label text-xs text-muted-foreground">
                The two seconds that stop the transfer
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
