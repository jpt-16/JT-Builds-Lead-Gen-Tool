import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Fetches a lead's homepage politely and classifies what came back.
// Identifies itself honestly, follows up to 5 redirects by hand, caps the
// body at 1.5 MB, and refuses to fetch private network addresses (a listed
// "website" should never make the server call into its own network).

const USER_AGENT = "Mozilla/5.0 (compatible; JTBuildsLeadEngine/1.0; +https://jtbuildsco.com)";
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 1_500_000;

export type HomepageResult =
  | { kind: "ok"; requestedUrl: string; finalUrl: string; html: string; httpsBroken: boolean }
  | { kind: "dead"; requestedUrl: string; reason: string }
  | { kind: "blocked"; requestedUrl: string; finalUrl: string; reason: string };

class FetchFailure extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export async function fetchHomepage(url: URL): Promise<HomepageResult> {
  const requestedUrl = url.toString();
  try {
    return await fetchAndClassify(url, requestedUrl, false);
  } catch (error) {
    const failure = toFailure(error);
    // A broken certificate is common on small-business sites. If HTTPS fails
    // that way, try plain HTTP before calling the site dead.
    if (url.protocol === "https:" && failure.code === "tls") {
      const httpUrl = new URL(url);
      httpUrl.protocol = "http:";
      try {
        return await fetchAndClassify(httpUrl, requestedUrl, true);
      } catch (retryError) {
        return { kind: "dead", requestedUrl, reason: toFailure(retryError).message };
      }
    }
    return { kind: "dead", requestedUrl, reason: failure.message };
  }
}

async function fetchAndClassify(url: URL, requestedUrl: string, httpsBroken: boolean): Promise<HomepageResult> {
  const { response, finalUrl } = await fetchFollowingRedirects(url);
  const status = response.status;

  if (status === 404 || status === 410) {
    await response.body?.cancel();
    return { kind: "dead", requestedUrl, reason: `Homepage returns ${status} (not found).` };
  }
  if (status === 401 || status === 403 || status === 429 || (status >= 400 && status < 500)) {
    await response.body?.cancel();
    return { kind: "blocked", requestedUrl, finalUrl, reason: `Site refused our check (HTTP ${status}).` };
  }
  if (status >= 500) {
    const challenge = response.headers.get("cf-mitigated") || response.headers.get("server")?.includes("cloudflare");
    await response.body?.cancel();
    if (status === 503 && challenge) {
      return { kind: "blocked", requestedUrl, finalUrl, reason: "Site is behind a bot check (Cloudflare)." };
    }
    return { kind: "dead", requestedUrl, reason: `Site returns a server error (HTTP ${status}).` };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/html|xml/i.test(contentType)) {
    await response.body?.cancel();
    return { kind: "dead", requestedUrl, reason: `Homepage is not a web page (${contentType.split(";")[0]}).` };
  }

  const html = await readCapped(response);
  if (/<title>\s*Just a moment\.\.\.\s*<\/title>|cf-chl|challenge-platform/i.test(html) && html.length < 50_000) {
    return { kind: "blocked", requestedUrl, finalUrl, reason: "Site is behind a bot check (Cloudflare)." };
  }
  return { kind: "ok", requestedUrl, finalUrl, html, httpsBroken };
}

async function fetchFollowingRedirects(start: URL): Promise<{ response: Response; finalUrl: string }> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(current.hostname);
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      current = new URL(location, current);
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        throw new FetchFailure("Redirects to a non-web address.", "redirect");
      }
      continue;
    }
    return { response, finalUrl: current.toString() };
  }
  throw new FetchFailure("Too many redirects.", "redirect");
}

async function readCapped(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
}

function toFailure(error: unknown): FetchFailure {
  if (error instanceof FetchFailure) return error;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new FetchFailure(`No response within ${TIMEOUT_MS / 1000} seconds.`, "timeout");
  }
  const code = String((error as { cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code ?? "");
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") {
    return new FetchFailure("Domain does not resolve (no DNS record).", "dns");
  }
  if (code === "ECONNREFUSED") return new FetchFailure("Server refused the connection.", "refused");
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") return new FetchFailure("Connection was dropped.", "reset");
  if (code === "UND_ERR_CONNECT_TIMEOUT") return new FetchFailure("Connection timed out.", "timeout");
  if (/CERT|SSL|TLS|ERR_TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code)) {
    return new FetchFailure("HTTPS certificate is invalid.", "tls");
  }
  return new FetchFailure("Could not load the site.", code || "unknown");
}

/** Throws if the host is, or resolves to, a private or local address. */
async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FetchFailure("Website address points to a private network.", "private");
  }
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new FetchFailure("Domain does not resolve (no DNS record).", "dns");
    }
  }
  if (addresses.some(isPrivateAddress)) {
    throw new FetchFailure("Website address points to a private network.", "private");
  }
}

export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  return ip === "::" || ip === "::1" || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip);
}
