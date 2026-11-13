import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSearch } from "./find-leads";
import { locateTown, searchTextPage, type Place } from "./places";
import { reservePlacesRequest } from "./places-usage";

vi.mock("./places", async (importActual) => ({ ...(await importActual<typeof import("./places")>()), locateTown: vi.fn(), searchTextPage: vi.fn() }));
vi.mock("./places-usage", async (importActual) => ({ ...(await importActual<typeof import("./places-usage")>()), reservePlacesRequest: vi.fn() }));
vi.mock("./derived", () => ({ recomputeDerived: vi.fn().mockResolvedValue(0) }));

const center = { latitude: 42.03, longitude: -71.22 };

function place(n: number, overrides: Partial<Place> = {}): Place {
  return {
    id: `p${n}`,
    displayName: { text: `Business ${n}` },
    formattedAddress: `${n} Main St, Mansfield, MA`,
    addressComponents: [
      { longText: "Mansfield", shortText: "Mansfield", types: ["locality"] },
      { longText: "Massachusetts", shortText: "MA", types: ["administrative_area_level_1"] },
    ],
    location: center,
    nationalPhoneNumber: `(508) 555-01${String(n).padStart(2, "0")}`,
    businessStatus: "OPERATIONAL",
    types: ["plumber", "point_of_interest"],
    primaryType: "plumber",
    ...overrides,
  };
}

type Call = { table: string; op: string; payload?: unknown; filters: unknown[] };

/** A just-enough fake of the supabase-js calls runSearch makes. */
function fakeSupabase(existing: { place_id: string; website_url: string | null }[] = []) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    let single = false;
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), builder),
      upsert: (payload: unknown) => ((call.op = "upsert"), (call.payload = payload), builder),
      update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), builder),
      in: (...args: unknown[]) => (call.filters.push(args), builder),
      eq: (...args: unknown[]) => (call.filters.push(args), builder),
      single: () => ((single = true), builder),
      then: (resolve: (value: unknown) => void) => {
        let data: unknown = [];
        if (table === "search_runs" && call.op === "insert") data = { id: "run-1" };
        else if (table === "leads" && call.op === "select") data = existing;
        else if (table === "leads" && call.op === "upsert" && Array.isArray(call.payload))
          data = call.payload.map((r: { place_id: string }) => ({ place_id: r.place_id }));
        resolve({ data: single || !Array.isArray(data) ? data : data, error: null });
      },
    };
    return builder;
  };
  return { supabase: { from } as never, calls };
}

const config = { apiKey: "k", dailyLimit: 30 };
const input = { trade: "plumber", city: "Mansfield", state: "MA" as const, radiusM: 16093 };

beforeEach(() => {
  vi.mocked(reservePlacesRequest)
    .mockReset()
    .mockImplementation(async (_s, limit) => ({ used: 1, limit }));
  vi.mocked(locateTown).mockReset().mockResolvedValue(center);
  vi.mocked(searchTextPage).mockReset();
});

const inserted = (calls: Call[]) =>
  calls.find((c) => c.table === "leads" && c.op === "upsert" && (c.payload as { search_run_id?: string }[])[0]?.search_run_id !== undefined)
    ?.payload as Record<string, unknown>[];

describe("runSearch", () => {
  it("honours the results cap: one page for 20, two for 40", async () => {
    vi.mocked(searchTextPage).mockResolvedValue({ places: Array.from({ length: 20 }, (_, i) => place(i + 1)), nextPageToken: "more" });
    const a = await runSearch(fakeSupabase().supabase, { ...input, maxResults: 20 }, config);
    expect(a.requestsUsed).toBe(2); // locate the town + one page
    expect(searchTextPage).toHaveBeenCalledTimes(1);

    vi.mocked(searchTextPage).mockClear();
    const b = await runSearch(fakeSupabase().supabase, { ...input, maxResults: 40 }, config);
    expect(b.requestsUsed).toBe(3);
    expect(searchTextPage).toHaveBeenCalledTimes(2);
  });

  it("keeps only the first maxResults results", async () => {
    vi.mocked(searchTextPage).mockResolvedValue({ places: Array.from({ length: 30 }, (_, i) => place(i + 1)) });
    const summary = await runSearch(fakeSupabase().supabase, { ...input, maxResults: 20 }, config);
    expect(summary.resultsFound).toBe(20);
  });

  it("stores the run on new leads, and each lead's position in Google's results", async () => {
    vi.mocked(searchTextPage).mockResolvedValue({ places: [place(1), place(2), place(3)] });
    const { supabase, calls } = fakeSupabase();
    const summary = await runSearch(supabase, { ...input, maxResults: 20, targetId: "t-1" }, config);

    expect(summary.runId).toBe("run-1");
    const run = calls.find((c) => c.table === "search_runs" && c.op === "insert")!.payload as Record<string, unknown>;
    expect(run).toMatchObject({ trade: "plumber", max_results: 20, target_id: "t-1", results_found: 3, new_leads_added: 0 });
    expect(inserted(calls).map((r) => [r.place_id, r.search_run_id, r.search_rank, r.search_rank_query])).toEqual([
      ["p1", "run-1", 1, "plumber in Mansfield, MA"],
      ["p2", "run-1", 2, "plumber in Mansfield, MA"],
      ["p3", "run-1", 3, "plumber in Mansfield, MA"],
    ]);
    // The run's final count is written after the leads are saved.
    expect(calls.find((c) => c.table === "search_runs" && c.op === "update")!.payload).toEqual({ new_leads_added: 3 });
    expect(summary.newLeads).toBe(3);
  });

  it("ranks by Google's order even when closed or far-away places are dropped", async () => {
    vi.mocked(searchTextPage).mockResolvedValue({
      places: [place(1, { businessStatus: "CLOSED_PERMANENTLY" }), place(2, { location: { latitude: 45, longitude: -71 } }), place(3)],
    });
    const { supabase, calls } = fakeSupabase();
    const summary = await runSearch(supabase, input, config);
    expect(summary).toMatchObject({ skippedClosed: 1, skippedOutsideRadius: 1, newLeads: 1 });
    expect(inserted(calls)[0]).toMatchObject({ place_id: "p3", search_rank: 3 });
  });

  it("refreshes existing leads with their new rank but leaves their first search alone", async () => {
    vi.mocked(searchTextPage).mockResolvedValue({ places: [place(1), place(2)] });
    const { supabase, calls } = fakeSupabase([{ place_id: "p1", website_url: null }]);
    const summary = await runSearch(supabase, input, config);
    expect(summary).toMatchObject({ newLeads: 1, updatedLeads: 1 });
    const updates = calls.filter((c) => c.table === "leads" && c.op === "upsert" && !(c.payload as { search_run_id?: string }[])[0]?.search_run_id)[0]
      .payload as Record<string, unknown>[];
    expect(updates[0]).toMatchObject({ place_id: "p1", search_rank: 1, categories: ["plumber"], has_hours: false, photo_count: 0 });
    expect(updates[0]).not.toHaveProperty("search_run_id");
  });

  it("writes rows for a named owner when the daily job runs without a signed-in user", async () => {
    vi.mocked(searchTextPage).mockResolvedValue({ places: [place(1), place(2)] });
    const { supabase, calls } = fakeSupabase([{ place_id: "p2", website_url: null }]);
    await runSearch(supabase, input, { ...config, ownerId: "owner-1" });

    expect(vi.mocked(reservePlacesRequest).mock.calls.every((c) => c[2] === "owner-1")).toBe(true);
    const writes = calls.filter((c) => c.op === "upsert" || (c.table === "search_runs" && c.op === "insert"));
    expect(writes.length).toBeGreaterThanOrEqual(3);
    for (const call of writes) {
      for (const row of Array.isArray(call.payload) ? call.payload : [call.payload]) expect(row).toMatchObject({ owner_id: "owner-1" });
    }
  });

  it("does not set an owner for a signed-in search", async () => {
    vi.mocked(searchTextPage).mockResolvedValue({ places: [place(1)] });
    const { supabase, calls } = fakeSupabase();
    await runSearch(supabase, input, config);
    expect(vi.mocked(reservePlacesRequest).mock.calls.every((c) => c[2] === undefined)).toBe(true);
    expect(inserted(calls)[0]).not.toHaveProperty("owner_id");
  });
});
