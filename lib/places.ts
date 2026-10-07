import "server-only";

// Google Places API (New). Server only: the API key never reaches the browser.
// Field masks are kept to what the leads table needs. Requesting phone,
// website or rating bills at the Text Search / Place Details Enterprise tier.

const BASE_URL = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 15_000;

const PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "nationalPhoneNumber",
  "websiteUri",
  "rating",
  "userRatingCount",
  "googleMapsUri",
  "businessStatus",
];

// location is only used to drop results outside the chosen radius; it is not stored.
const SEARCH_FIELD_MASK = [...PLACE_FIELDS, "location"].map((f) => `places.${f}`).concat("nextPageToken").join(",");
const DETAILS_FIELD_MASK = PLACE_FIELDS.join(",");
// Locating a town only needs coordinates (Text Search Pro tier).
const GEOCODE_FIELD_MASK = "places.location";

export type LatLng = { latitude: number; longitude: number };

export type Place = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  addressComponents?: { longText: string; shortText: string; types: string[] }[];
  location?: LatLng;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";
};

/** The Google-sourced lead columns. Everything here is refreshable. */
export type LeadGoogleFields = {
  place_id: string;
  business_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  rating: number | null;
  review_count: number;
  has_website: boolean;
};

export class PlacesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PlacesApiError";
  }
}

async function placesRequest<T>(apiKey: string, path: string, fieldMask: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PlacesApiError("Could not reach the Google Places API. Try again.", 504);
  }

  if (!response.ok) {
    // Google's error message is safe to show (it never echoes the key).
    let detail = "";
    try {
      const data = (await response.json()) as { error?: { message?: string } };
      detail = data.error?.message ?? "";
    } catch {
      // Non-JSON error body; the status code is enough.
    }
    throw new PlacesApiError(
      `Google Places API returned ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

/** Center point of a town, or null if Google cannot find it. One request. */
export async function locateTown(apiKey: string, city: string, state: string): Promise<LatLng | null> {
  const data = await placesRequest<{ places?: Pick<Place, "location">[] }>(apiKey, "/places:searchText", GEOCODE_FIELD_MASK, {
    textQuery: `${city}, ${state}`,
    regionCode: "us",
    pageSize: 1,
  });
  return data.places?.[0]?.location ?? null;
}

/** One page (up to 20 results) of a Text Search. One request. */
export async function searchTextPage(
  apiKey: string,
  params: { textQuery: string; center: LatLng; radiusM: number; pageToken?: string },
): Promise<{ places: Place[]; nextPageToken?: string }> {
  const data = await placesRequest<{ places?: Place[]; nextPageToken?: string }>(
    apiKey,
    "/places:searchText",
    SEARCH_FIELD_MASK,
    {
      textQuery: params.textQuery,
      regionCode: "us",
      pageSize: 20,
      locationBias: { circle: { center: params.center, radius: params.radiusM } },
      ...(params.pageToken ? { pageToken: params.pageToken } : {}),
    },
  );
  return { places: data.places ?? [], nextPageToken: data.nextPageToken || undefined };
}

/** Fresh details for one place, or null if Google no longer knows the ID. One request. */
export async function getPlaceDetails(apiKey: string, placeId: string): Promise<Place | null> {
  try {
    return await placesRequest<Place>(apiKey, `/places/${encodeURIComponent(placeId)}`, DETAILS_FIELD_MASK);
  } catch (error) {
    if (error instanceof PlacesApiError && error.status === 404) return null;
    throw error;
  }
}

function addressPart(place: Place, types: string[], text: "longText" | "shortText"): string | null {
  for (const type of types) {
    const part = place.addressComponents?.find((c) => c.types.includes(type));
    if (part?.[text]) return part[text];
  }
  return null;
}

/** Maps a Google place to the refreshable lead columns. */
export function toLeadFields(place: Place): LeadGoogleFields {
  const website = place.websiteUri?.trim() || null;
  return {
    place_id: place.id,
    business_name: place.displayName?.text?.trim() || "Unnamed business",
    address: place.formattedAddress ?? null,
    // New England towns usually come back as locality; villages sometimes as
    // sublocality or a county subdivision.
    city: addressPart(place, ["locality", "postal_town", "sublocality_level_1", "administrative_area_level_3"], "longText"),
    state: addressPart(place, ["administrative_area_level_1"], "shortText"),
    phone: place.nationalPhoneNumber ?? null,
    website_url: website,
    google_maps_url: place.googleMapsUri ?? null,
    rating: typeof place.rating === "number" ? Math.round(place.rating * 10) / 10 : null,
    review_count: place.userRatingCount ?? 0,
    has_website: Boolean(website),
  };
}

/** Great-circle distance in meters. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
