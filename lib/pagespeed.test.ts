import { afterEach, describe, expect, it, vi } from "vitest";
import { PageSpeedConfigError, runPageSpeed } from "./pagespeed";
import { mapSeoToolResponse } from "./seo-tool";
import { initialSiteFields, normalizeUrl, socialPlatform } from "./website";

afterEach(() => vi.unstubAllGlobals());

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("runPageSpeed", () => {
  it("reads performance, LCP and CLS from a mobile run", async () => {
    const fetchMock = mockFetch(200, {
      lighthouseResult: {
        categories: { performance: { score: 0.43 } },
        audits: {
          "largest-contentful-paint": { numericValue: 5234.6 },
          "cumulative-layout-shift": { numericValue: 0.1234 },
        },
      },
    });
    expect(await runPageSpeed("https://acme.example/", "key-1")).toEqual({ ok: true, performance: 43, lcpMs: 5235, cls: 0.123 });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("strategy")).toBe("mobile");
    expect(url.searchParams.get("key")).toBe("key-1");
  });

  it("marks rate limits as retryable", async () => {
    mockFetch(429, { error: { message: "Quota exceeded" } });
    expect(await runPageSpeed("https://a.example/", null)).toMatchObject({ ok: false, retryable: true });
  });

  it("does not retry a page Lighthouse could not load", async () => {
    mockFetch(200, { lighthouseResult: { runtimeError: { code: "NO_FCP" }, categories: { performance: { score: null } } } });
    expect(await runPageSpeed("https://a.example/", null)).toMatchObject({ ok: false, retryable: false });
  });

  it("throws a setup error when the key is rejected", async () => {
    mockFetch(403, { error: { message: "PageSpeed Insights API has not been used in project 123" } });
    await expect(runPageSpeed("https://a.example/", "bad")).rejects.toThrow(PageSpeedConfigError);
  });
});

describe("mapSeoToolResponse", () => {
  it("maps score and issues under common field names", () => {
    expect(mapSeoToolResponse({ overall_score: 0.62, findings: [{ title: "Slow LCP", impact: -8 }, "No schema"] })).toEqual({
      scoreTotal: 62,
      issues: [
        { message: "Slow LCP", points: 8 },
        { message: "No schema", points: 0 },
      ],
    });
  });

  it("returns null without a score", () => {
    expect(mapSeoToolResponse({ issues: [] })).toBeNull();
    expect(mapSeoToolResponse("nope")).toBeNull();
  });
});

describe("website classification", () => {
  it("recognises social and directory pages as no real website", () => {
    expect(socialPlatform("https://www.facebook.com/AcmeLandscaping")).toBe("Facebook");
    expect(socialPlatform("m.facebook.com/acme")).toBe("Facebook");
    expect(socialPlatform("https://www.yelp.com/biz/acme")).toBe("Yelp");
    expect(socialPlatform("https://www.google.com/maps/place/acme")).toBe("Google Maps");
    expect(socialPlatform("https://acme-landscaping.com")).toBeNull();
  });

  it("normalizes listed addresses and rejects junk", () => {
    expect(normalizeUrl("acme.example/home")?.toString()).toBe("https://acme.example/home");
    expect(normalizeUrl("ftp://acme.example")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });

  it("sends only real sites to the scoring queue", () => {
    const now = new Date("2026-10-08T00:00:00Z");
    expect(initialSiteFields(null, now)).toEqual({ site_status: "none", scored_at: now.toISOString() });
    expect(initialSiteFields("https://instagram.com/acme", now)).toEqual({ site_status: "social", scored_at: now.toISOString() });
    expect(initialSiteFields("https://acme.example", now)).toEqual({ site_status: null, scored_at: null });
  });
});
