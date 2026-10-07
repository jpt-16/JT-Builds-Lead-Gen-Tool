import { afterEach, describe, expect, it, vi } from "vitest";
import { distanceMeters, getPlaceDetails, PlacesApiError, searchTextPage, toLeadFields, type Place } from "./places";

// A trimmed Places API (New) Text Search result.
const acme: Place = {
  id: "ChIJacme",
  displayName: { text: "Acme Landscaping" },
  formattedAddress: "12 Main St, Mansfield, MA 02048, USA",
  addressComponents: [
    { longText: "12", shortText: "12", types: ["street_number"] },
    { longText: "Mansfield", shortText: "Mansfield", types: ["locality", "political"] },
    { longText: "Bristol County", shortText: "Bristol County", types: ["administrative_area_level_2", "political"] },
    { longText: "Massachusetts", shortText: "MA", types: ["administrative_area_level_1", "political"] },
  ],
  location: { latitude: 42.0334, longitude: -71.219 },
  nationalPhoneNumber: "(508) 555-0100",
  rating: 4.66,
  userRatingCount: 6,
  googleMapsUri: "https://maps.google.com/?cid=1",
  businessStatus: "OPERATIONAL",
};

afterEach(() => vi.unstubAllGlobals());

function mockFetch(...responses: Array<{ status?: number; body: unknown }>) {
  const fetchMock = vi.fn();
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(r.body), { status: r.status ?? 200 }));
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("toLeadFields", () => {
  it("maps a place with no website", () => {
    expect(toLeadFields(acme)).toEqual({
      place_id: "ChIJacme",
      business_name: "Acme Landscaping",
      address: "12 Main St, Mansfield, MA 02048, USA",
      city: "Mansfield",
      state: "MA",
      phone: "(508) 555-0100",
      website_url: null,
      google_maps_url: "https://maps.google.com/?cid=1",
      rating: 4.7,
      review_count: 6,
      has_website: false,
    });
  });

  it("sets has_website from the website field", () => {
    expect(toLeadFields({ ...acme, websiteUri: "https://acme.example" }).has_website).toBe(true);
    expect(toLeadFields({ ...acme, websiteUri: "  " }).has_website).toBe(false);
  });

  it("falls back to a county subdivision for the town and defaults missing counts", () => {
    const fields = toLeadFields({
      id: "x",
      addressComponents: [{ longText: "Hollis", shortText: "Hollis", types: ["administrative_area_level_3"] }],
    });
    expect(fields.city).toBe("Hollis");
    expect(fields.review_count).toBe(0);
    expect(fields.rating).toBeNull();
    expect(fields.business_name).toBe("Unnamed business");
  });
});

describe("searchTextPage", () => {
  it("sends the key and field mask as headers and returns the page token", async () => {
    const fetchMock = mockFetch({ body: { places: [acme], nextPageToken: "next-1" } });
    const result = await searchTextPage("test-key", {
      textQuery: "landscaper in Mansfield, MA",
      center: { latitude: 42, longitude: -71 },
      radiusM: 16093,
    });

    expect(result.places).toHaveLength(1);
    expect(result.nextPageToken).toBe("next-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(init.headers["X-Goog-FieldMask"]).toContain("places.websiteUri");
    expect(init.headers["X-Goog-FieldMask"]).toContain("nextPageToken");
    expect(JSON.parse(init.body)).toMatchObject({ pageSize: 20, locationBias: { circle: { radius: 16093 } } });
  });

  it("handles an empty result", async () => {
    mockFetch({ body: {} });
    const result = await searchTextPage("k", { textQuery: "q", center: { latitude: 0, longitude: 0 }, radiusM: 1000 });
    expect(result).toEqual({ places: [], nextPageToken: undefined });
  });

  it("surfaces Google's error message with the status", async () => {
    mockFetch({ status: 403, body: { error: { message: "API key not valid." } } });
    const call = searchTextPage("k", { textQuery: "q", center: { latitude: 0, longitude: 0 }, radiusM: 1000 });
    await expect(call).rejects.toThrow(PlacesApiError);
    await expect(call).rejects.toThrow("Google Places API returned 403: API key not valid.");
  });
});

describe("getPlaceDetails", () => {
  it("returns null when Google no longer knows the place", async () => {
    mockFetch({ status: 404, body: { error: { message: "Not found" } } });
    expect(await getPlaceDetails("k", "gone")).toBeNull();
  });
});

describe("distanceMeters", () => {
  it("is roughly right for Mansfield to Foxborough town centers (about 4 km)", () => {
    const d = distanceMeters({ latitude: 42.0334, longitude: -71.219 }, { latitude: 42.0654, longitude: -71.2478 });
    expect(d).toBeGreaterThan(3500);
    expect(d).toBeLessThan(5000);
  });
});
