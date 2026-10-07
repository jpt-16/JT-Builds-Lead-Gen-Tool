import { normalizePhone } from "@/lib/phone";

type SuppressionRow = { phone: string | null; email: string | null; business_name: string | null };

const NAME_SUFFIXES = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd)\b\.?/g;

/**
 * Lowercased business name with punctuation and legal suffixes removed, so
 * "Acme Landscaping, LLC" and "acme landscaping" match.
 */
export function normalizeBusinessName(name: string | null | undefined): string | null {
  const cleaned = (name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(NAME_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return cleaned || null;
}

/**
 * Builds a check against the do-not-contact list. A business is suppressed
 * if its phone or its normalized name matches any suppression row.
 */
export function buildSuppressionMatcher(rows: SuppressionRow[]) {
  const phones = new Set<string>();
  const names = new Set<string>();
  for (const row of rows) {
    const phone = normalizePhone(row.phone);
    if (phone) phones.add(phone);
    const name = normalizeBusinessName(row.business_name);
    if (name) names.add(name);
  }

  return (lead: { phone: string | null; business_name: string }) => {
    const phone = normalizePhone(lead.phone);
    if (phone && phones.has(phone)) return true;
    const name = normalizeBusinessName(lead.business_name);
    return Boolean(name && names.has(name));
  };
}
