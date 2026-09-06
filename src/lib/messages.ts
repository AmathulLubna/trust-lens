import type { Verdict } from "./trustlens";

export interface MessageSignal {
  id: string;
  label: string;
  weight: number;
  severity: "info" | "warning" | "critical";
  test: (text: string, sender?: string) => boolean;
}

export const MESSAGE_SIGNALS: MessageSignal[] = [
  {
    id: "money",
    label: "Requests money, UPI, wallet transfer, or payment",
    weight: 32,
    severity: "critical",
    test: (text) =>
      /\b(send|transfer|pay|deposit|refund|receive|collect)\b.{0,40}\b(money|cash|rs|rupees|inr|upi|gpay|phonepe|paytm|wallet|bank)\b/i.test(
        text,
      ) || /(?:rs\.?|inr|₹)\s?\d+/i.test(text),
  },
  {
    id: "otp",
    label: "Asks for OTP, PIN, password, card, Aadhaar, or bank details",
    weight: 36,
    severity: "critical",
    test: (text) =>
      /\b(otp|pin|password|cvv|card number|bank details|aadhaar|pan|netbanking|login code|verification code)\b/i.test(
        text,
      ),
  },
  {
    id: "urgency",
    label: "Pushes urgency or immediate action",
    weight: 18,
    severity: "warning",
    test: (text) =>
      /\b(urgent|immediately|right now|asap|last chance|today only|within \d+ (minutes|hours)|account blocked|will be closed|final warning)\b/i.test(
        text,
      ),
  },
  {
    id: "impersonation",
    label: "Claims to be family, bank, courier, police, or support",
    weight: 22,
    severity: "warning",
    test: (text) =>
      /\b(i am|i'm|this is|from|bol raha|bol rahi)\b.{0,40}\b(mom|mother|amma|papa|dad|father|son|daughter|bank|sbi|hdfc|icici|axis|rbi|police|customs|fedex|dhl|courier|support|customer care)\b/i.test(
        text,
      ),
  },
  {
    id: "link",
    label: "Contains a suspicious link or shortened URL",
    weight: 22,
    severity: "warning",
    test: (text) =>
      /(https?:\/\/|www\.)\S+/i.test(text) ||
      /\b(bit\.ly|tinyurl|t\.co|wa\.me|forms\.gle|shorturl|cutt\.ly|rebrand\.ly)\b/i.test(text),
  },
  {
    id: "bait",
    label: "Uses common scam bait such as KYC, parcel, prize, job, or investment",
    weight: 18,
    severity: "warning",
    test: (text) =>
      /\b(kyc|parcel|courier|lottery|prize|winner|refund|investment|trading|double your|job offer|work from home|loan approved|gift card|electricity bill)\b/i.test(
        text,
      ),
  },
  {
    id: "secrecy",
    label: "Pressures the recipient not to tell anyone",
    weight: 24,
    severity: "critical",
    test: (text) =>
      /\b(don'?t tell|do not tell|keep this secret|just between us|mat batana|nobody else)\b/i.test(
        text,
      ),
  },
  {
    id: "random-sender",
    label: "Sender is unknown or looks like a random private number",
    weight: 10,
    severity: "info",
    test: (_text, sender) => {
      if (!sender?.trim()) return false;
      const digits = sender.replace(/\D/g, "");
      return digits.length >= 10 && !/\b(bank|sbi|hdfc|icici|axis|airtel|jio|amazon|flipkart|zomato|swiggy)\b/i.test(sender);
    },
  },
];

export function messageSignalsFromText(text: string, sender?: string): MessageSignal[] {
  return MESSAGE_SIGNALS.filter((signal) => signal.test(text, sender));
}

export function messageRiskFromSignals(signals: MessageSignal[]): number {
  const ids = new Set(signals.map((s) => s.id));
  let risk = signals.reduce((sum, s) => sum + s.weight, 0);
  if ((ids.has("money") || ids.has("otp")) && ids.has("urgency")) risk += 14;
  if ((ids.has("money") || ids.has("otp")) && ids.has("impersonation")) risk += 14;
  if (ids.has("random-sender") && (ids.has("money") || ids.has("otp") || ids.has("link"))) {
    risk += 8;
  }
  if (ids.size === 1 && ids.has("random-sender")) risk = 12;
  return Math.max(0, Math.min(100, risk));
}

export function verdictFromMessageRisk(risk: number): Verdict {
  if (risk >= 70) return "flagged";
  if (risk >= 40) return "suspicious";
  return "safe";
}

export function isBenignMessage(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  const words = normalized.split(/\s+/).length;
  return (
    words <= 20 &&
    /\b(hello|hi|hey|namaste|how are you|how are u|how r u|kaise ho|good morning|good evening|thanks|thank you|ok|okay)\b/i.test(
      normalized,
    )
  );
}

export function calibrateMessageVerdict(
  verdict: Verdict,
  text: string,
  signals: MessageSignal[],
): Verdict {
  const ids = new Set(signals.map((s) => s.id));
  const hasCriticalAsk = ids.has("money") || ids.has("otp") || ids.has("secrecy");
  const hasPattern =
    hasCriticalAsk ||
    ((ids.has("urgency") || ids.has("impersonation")) && (ids.has("link") || ids.has("bait")));

  if (isBenignMessage(text) && !hasPattern) return "safe";
  if (verdict === "flagged" && !hasPattern) {
    return signals.length > 0 ? "suspicious" : "safe";
  }
  if (verdict === "suspicious" && signals.length === 0) return "safe";
  return verdict;
}
