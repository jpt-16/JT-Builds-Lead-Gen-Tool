import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Public by default; individual tests override.
const lookup = vi.fn(async (): Promise<{ address: string; family: number }[]> => [{ address: "93.184.216.34", family: 4 }]);
vi.mock("node:dns/promises", () => ({ lookup: () => lookup() }));

const { fetchHomepage, isPrivateAddress } = await import("./site-fetch");

function html(body: string, init: ResponseInit = {}) {
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });
}
function redirect(location: string, status = 301) {
  return new Response(null, { status, headers: { location } });
}
function networkError(code: string) {
  return Object.assign(new TypeError("fetch failed"), { cause: { code } });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  lookup.mockClear();
});

describe("fetchHomepage", () => {
  it("follows redirects and reports the final URL", async () => {
    fetchMock.mockResolvedValueOnce(redirect("https://www.acme.example/")).mockResolvedValueOnce(html("<h1>Acme</h1>"));
    const result = await fetchHomepage(new URL("http://acme.example"));
    expect(result).toMatchObject({ kind: "ok", finalUrl: "https://www.acme.example/", html: "<h1>Acme</h1>", httpsBroken: false });
    expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toContain("JTBuildsLeadEngine");
  });

  it("calls a domain that does not resolve dead", async () => {
    lookup.mockRejectedValueOnce(Object.assign(new Error("not found"), { code: "ENOTFOUND" }));
    const result = await fetchHomepage(new URL("https://gone.example"));
    expect(result).toEqual({ kind: "dead", requestedUrl: "https://gone.example/", reason: "Domain does not resolve (no DNS record)." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls a 404 homepage or a refused connection dead", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    expect((await fetchHomepage(new URL("https://a.example"))).kind).toBe("dead");
    fetchMock.mockRejectedValueOnce(networkError("ECONNREFUSED"));
    expect(await fetchHomepage(new URL("https://a.example"))).toMatchObject({ kind: "dead", reason: "Server refused the connection." });
  });

  it("treats a timeout as dead without throwing", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    expect(await fetchHomepage(new URL("https://slow.example"))).toMatchObject({ kind: "dead", reason: "No response within 12 seconds." });
  });

  it("reports 403s and bot walls as blocked, not dead", async () => {
    fetchMock.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    expect((await fetchHomepage(new URL("https://a.example"))).kind).toBe("blocked");
    fetchMock.mockResolvedValueOnce(html("<title>Just a moment...</title><div class='cf-chl'></div>"));
    expect((await fetchHomepage(new URL("https://a.example"))).kind).toBe("blocked");
  });

  it("falls back to HTTP when the HTTPS certificate is broken", async () => {
    fetchMock.mockRejectedValueOnce(networkError("CERT_HAS_EXPIRED")).mockResolvedValueOnce(html("<h1>Hi</h1>"));
    const result = await fetchHomepage(new URL("https://acme.example"));
    expect(result).toMatchObject({ kind: "ok", finalUrl: "http://acme.example/", httpsBroken: true });
  });

  it("refuses to fetch private network addresses, even via redirect", async () => {
    expect(await fetchHomepage(new URL("http://127.0.0.1"))).toMatchObject({ kind: "dead", reason: expect.stringContaining("private") });
    fetchMock.mockResolvedValueOnce(redirect("http://169.254.169.254/latest/meta-data"));
    expect(await fetchHomepage(new URL("https://acme.example"))).toMatchObject({ kind: "dead", reason: expect.stringContaining("private") });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("isPrivateAddress", () => {
  it("flags private, loopback, link-local and metadata ranges", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "172.16.5.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });
});
