import "server-only";

// Google PageSpeed Insights, mobile strategy, performance category only.
// Free. Without a key the shared quota is tiny; with one it is 25,000 a day.

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const TIMEOUT_MS = 60_000;

export type PageSpeedResult =
  | { ok: true; performance: number; lcpMs: number | null; cls: number | null }
  | { ok: false; retryable: boolean; reason: string };

/** Thrown when the PageSpeed key or API setup is wrong, so every call would fail. */
export class PageSpeedConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageSpeedConfigError";
  }
}

type PsiResponse = {
  lighthouseResult?: {
    runtimeError?: { code?: string; message?: string };
    categories?: { performance?: { score?: number | null } };
    audits?: Record<string, { numericValue?: number }>;
  };
  error?: { code?: number; message?: string };
};

export async function runPageSpeed(url: string, apiKey: string | null): Promise<PageSpeedResult> {
  const params = new URLSearchParams({ url, strategy: "mobile", category: "performance" });
  if (apiKey) params.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?${params}`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return { ok: false, retryable: true, reason: "PageSpeed test timed out." };
  }

  const data = (await response.json().catch(() => ({}))) as PsiResponse;
  const message = data.error?.message ?? "";

  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      return { ok: false, retryable: true, reason: `PageSpeed is busy (HTTP ${response.status}).` };
    }
    if (/API key|API_KEY|has not been used|is disabled|PERMISSION_DENIED|blocked/i.test(message) || response.status === 403) {
      throw new PageSpeedConfigError(
        `PageSpeed Insights rejected the API key: ${message || response.status}. Enable the PageSpeed Insights API for the key, or set GOOGLE_PAGESPEED_API_KEY.`,
      );
    }
    // Usually the page itself could not be loaded by Lighthouse.
    return { ok: false, retryable: false, reason: "PageSpeed could not load the page." };
  }

  const lighthouse = data.lighthouseResult;
  const score = lighthouse?.categories?.performance?.score;
  if (!lighthouse || lighthouse.runtimeError?.code || typeof score !== "number") {
    return { ok: false, retryable: false, reason: "PageSpeed could not measure the page." };
  }

  const audits = lighthouse.audits ?? {};
  const audit = (id: string) => audits[id]?.numericValue;
  const lcp = audit("largest-contentful-paint");
  const cls = audit("cumulative-layout-shift");
  return {
    ok: true,
    performance: Math.round(score * 100),
    lcpMs: typeof lcp === "number" ? Math.round(lcp) : null,
    cls: typeof cls === "number" ? Math.round(cls * 1000) / 1000 : null,
  };
}
