export interface AlertPreferences {
  autoNotifyCircle: boolean;
}
export interface AlertRecipient {
  email?: string;
  notifyOnFlag: boolean;
  recipientVerifiedAt?: number;
  recipientConsent?: boolean;
}
export function eligibleRecipients(
  enabled: boolean,
  preferences: AlertPreferences | null,
  recipients: AlertRecipient[],
): string[] {
  if (!enabled || !preferences?.autoNotifyCircle) return [];
  return [
    ...new Set(
      recipients
        .filter(
          (r) =>
            r.notifyOnFlag &&
            r.recipientConsent === true &&
            !!r.recipientVerifiedAt &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email ?? ""),
        )
        .map((r) => r.email!.toLowerCase()),
    ),
  ].slice(0, 10);
}
