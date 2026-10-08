import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const key = process.env.FREEBUFF_EMAIL_API_KEY;
    if (!key) throw new Error("Email verification delivery is not configured");
    try {
      const response = await axios.post(
        "https://auth.freebuff.app/send_otp",
        {
          to: email,
          otp: token,
          appName: process.env.VLY_APP_NAME || "TrustLens",
        },
        { headers: { "x-api-key": key }, timeout: 10000 },
      );
      if (response.data?.error || response.data?.success === false)
        throw new Error("Provider rejected verification");
    } catch {
      // Axios errors can contain the OTP and provider credential; never expose them.
      throw new Error(
        "Verification delivery failed or is unconfirmed. Try again later.",
      );
    }
  },
});
