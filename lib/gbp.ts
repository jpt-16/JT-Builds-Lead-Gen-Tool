// Google Business Profile signals from the Places listing: missing hours, few
// photos, and where the business showed up in Google's results for its
// search. Pure functions, shared by the lead page, the scorer and the email
// writer. A null input means "not fetched yet", never "missing".

export type GbpInput = {
  has_hours: boolean | null;
  photo_count: number | null;
  primary_type: string | null;
  categories: string[] | null;
  search_rank: number | null;
  search_rank_query: string | null;
};

/** Google returns at most 10 photos, so fewer than this reads as a thin profile. */
export const FEW_PHOTOS = 3;
/** The local pack shows three businesses. */
export const LOCAL_PACK_SIZE = 3;

export type GbpGap = { key: "no_hours" | "no_photos" | "few_photos" | "outside_top_3"; text: string };

/** "hvac_contractor" -> "hvac contractor". */
export function typeLabel(type: string | null | undefined): string | null {
  const text = type?.replace(/_/g, " ").trim();
  return text || null;
}

/** Weak spots in the listing. Only what is known: an unfetched field says nothing. */
export function gbpGaps(l: GbpInput): GbpGap[] {
  const gaps: GbpGap[] = [];
  if (l.has_hours === false) gaps.push({ key: "no_hours", text: "No opening hours on the Google listing" });
  if (l.photo_count !== null) {
    if (l.photo_count === 0) gaps.push({ key: "no_photos", text: "No photos on the Google listing" });
    else if (l.photo_count < FEW_PHOTOS)
      gaps.push({ key: "few_photos", text: `Only ${l.photo_count} photo${l.photo_count === 1 ? "" : "s"} on the Google listing` });
  }
  if (l.search_rank !== null && l.search_rank > LOCAL_PACK_SIZE) {
    gaps.push({
      key: "outside_top_3",
      text: `Ranked #${l.search_rank} in Google results${l.search_rank_query ? ` for "${l.search_rank_query}"` : ""}, outside the top ${LOCAL_PACK_SIZE}`,
    });
  }
  return gaps;
}

/** Short readable facts for the lead page, known ones only. */
export function gbpFacts(l: GbpInput): string[] {
  const facts: string[] = [];
  const type = typeLabel(l.primary_type);
  if (type) facts.push(`Category: ${type}`);
  if (l.has_hours !== null) facts.push(l.has_hours ? "Hours listed" : "No hours listed");
  if (l.photo_count !== null)
    facts.push(l.photo_count === 0 ? "No photos" : `${l.photo_count}${l.photo_count >= 10 ? "+" : ""} photo${l.photo_count === 1 ? "" : "s"}`);
  if (l.search_rank !== null) facts.push(`#${l.search_rank} in results${l.search_rank_query ? ` for "${l.search_rank_query}"` : ""}`);
  return facts;
}
