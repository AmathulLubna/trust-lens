import axios from "axios";
import { afterEach, expect, it, vi } from "vitest";
import { emailOtp } from "../src/convex/auth/emailOtp";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const request = {
  identifier: "fixture@example.invalid",
  token: "fixture-otp",
} as Parameters<typeof emailOtp.sendVerificationRequest>[0];
it("requires configured verification delivery rather than a bundled credential", async () => {
  vi.stubEnv("FREEBUFF_EMAIL_API_KEY", "");
  const post = vi.spyOn(axios, "post");
  await expect(
    emailOtp.sendVerificationRequest(request, {} as never),
  ).rejects.toThrow("not configured");
  expect(post).not.toHaveBeenCalled();
});
it("does not leak provider credentials, OTPs, or request payloads on failure", async () => {
  vi.stubEnv("FREEBUFF_EMAIL_API_KEY", "fixture-secret");
  vi.spyOn(axios, "post").mockRejectedValue(
    new Error("fixture-secret fixture-otp"),
  );
  await expect(
    emailOtp.sendVerificationRequest(request, {} as never),
  ).rejects.toThrow("Verification delivery failed or is unconfirmed");
});
