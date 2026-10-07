/**
 * Digits-only US phone number for matching, e.g. "(508) 555-0100" and
 * "+1 508-555-0100" both become "5085550100". Returns null when there are
 * fewer than 10 digits.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}
