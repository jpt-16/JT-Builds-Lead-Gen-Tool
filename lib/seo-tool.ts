import "server-only";

// Adapter for my separate SEO audit tool. Used instead of the built-in
// checks when SEO_TOOL_URL and SEO_TOOL_API_KEY are both set.
//
// Request:  POST SEO_TOOL_URL, JSON { "url": "<site>" },
//           header Authorization: Bearer <SEO_TOOL_API_KEY>
// Response: JSON with a 0-100 score and an optional list of issues. Field
//           names are matched loosely (see mapSeoToolResponse) so the tool's
//           output can change without touching the rest of the app.

const TIMEOUT_MS = 90_000;

export type SeoToolResult = {
  scoreTotal: number;
  issues: { message: string; points: number }[];
};

export function getSeoToolConfig(): { endpoint: string; apiKey: string } | null {
  const endpoint = process.env.SEO_TOOL_URL;
  const apiKey = process.env.SEO_TOOL_API_KEY;
  return endpoint && apiKey ? { endpoint, apiKey } : null;
}

export class SeoToolError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SeoToolError";
  }
}

export async function scoreWithSeoTool(url: string, config: { endpoint: string; apiKey: string }): Promise<SeoToolResult> {
  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ url }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SeoToolError("SEO tool did not respond.", true);
  }
  if (response.status === 401 || response.status === 403) {
    throw new SeoToolError("SEO tool rejected SEO_TOOL_API_KEY.", false);
  }
  if (!response.ok) throw new SeoToolError(`SEO tool returned HTTP ${response.status}.`, response.status >= 500);

  const mapped = mapSeoToolResponse(await response.json().catch(() => null));
  if (!mapped) throw new SeoToolError("SEO tool response had no score.", false);
  return mapped;
}

/** Maps the SEO tool's JSON into a score and issues. Returns null if no score is found. */
export function mapSeoToolResponse(json: unknown): SeoToolResult | null {
  if (!json || typeof json !== "object") return null;
  const body = json as Record<string, unknown>;

  const rawScore = [body.score, body.score_total, body.overall_score, body.total].find((v) => typeof v === "number") as
    | number
    | undefined;
  if (rawScore === undefined) return null;
  // Accept 0-1 as well as 0-100.
  const scoreTotal = Math.max(0, Math.min(100, Math.round(rawScore <= 1 && rawScore > 0 ? rawScore * 100 : rawScore)));

  const rawIssues = [body.issues, body.deductions, body.findings].find(Array.isArray) as unknown[] | undefined;
  const issues = (rawIssues ?? [])
    .map((item) => {
      if (typeof item === "string") return { message: item, points: 0 };
      if (!item || typeof item !== "object") return null;
      const i = item as Record<string, unknown>;
      const message = [i.message, i.title, i.description, i.label].find((v) => typeof v === "string") as string | undefined;
      const points = [i.points, i.deduction, i.impact, i.weight].find((v) => typeof v === "number") as number | undefined;
      return message ? { message, points: Math.abs(points ?? 0) } : null;
    })
    .filter((i): i is { message: string; points: number } => i !== null);

  return { scoreTotal, issues };
}
