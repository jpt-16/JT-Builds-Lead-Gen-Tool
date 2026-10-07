"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useScoring } from "@/components/ScoringProvider";
import {
  DEFAULT_RADIUS_METERS,
  MAX_BULK_TOWNS,
  MAX_REQUESTS_PER_TOWN,
  parseTownList,
  RADIUS_OPTIONS,
  STATES,
  TRADE_PRESETS,
  type SearchSummary,
  type State,
  type Town,
  type Usage,
} from "@/lib/find-leads-config";

const CUSTOM = "__custom";

type TownStatus = "pending" | "running" | "done" | "error" | "skipped";
type TownResult = { town: Town; status: TownStatus; summary?: SearchSummary; message?: string };

export function FindLeadsForm({ initialUsage }: { initialUsage: Usage }) {
  const router = useRouter();
  const scoring = useScoring();
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [tradeChoice, setTradeChoice] = useState<string>(TRADE_PRESETS[0]);
  const [customTrade, setCustomTrade] = useState("");
  const [city, setCity] = useState("");
  const [townsText, setTownsText] = useState("");
  const [state, setState] = useState<State>("MA");
  const [radiusM, setRadiusM] = useState(DEFAULT_RADIUS_METERS);
  const [usage, setUsage] = useState(initialUsage);
  const [running, setRunning] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [results, setResults] = useState<TownResult[]>([]);
  const stopRequested = useRef(false);

  const trade = (tradeChoice === CUSTOM ? customTrade : tradeChoice).trim();
  const bulk = parseTownList(townsText, state);
  const towns: Town[] = mode === "single" ? (city.trim() ? [{ city: city.trim(), state }] : []) : bulk.towns;
  const estimate = towns.length * MAX_REQUESTS_PER_TOWN;
  const remaining = Math.max(0, usage.limit - usage.used);

  function updateResult(index: number, patch: Partial<TownResult>) {
    setResults((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (trade.length < 2) return setFormError("Choose a trade or type a custom one.");
    if (mode === "bulk" && bulk.errors.length) return setFormError(`Fix these lines: ${bulk.errors.join("; ")}`);
    if (towns.length === 0) return setFormError(mode === "single" ? "Enter a town." : "Enter at least one town.");
    if (towns.length > MAX_BULK_TOWNS) return setFormError(`Bulk mode runs up to ${MAX_BULK_TOWNS} towns at a time.`);
    if (remaining === 0) return setFormError(`Daily Places limit reached (${usage.used} of ${usage.limit}). It resets at midnight Eastern.`);

    stopRequested.current = false;
    let newLeads = 0;
    setRunning(true);
    setResults(towns.map((town) => ({ town, status: "pending" })));

    for (let i = 0; i < towns.length; i++) {
      if (stopRequested.current) {
        skipFrom(i, "Stopped.");
        break;
      }
      updateResult(i, { status: "running" });

      const outcome = await searchTown({ trade, ...towns[i], radiusM });
      if (outcome.usage) setUsage(outcome.usage);

      if (outcome.ok) {
        updateResult(i, { status: "done", summary: outcome.summary });
        newLeads += outcome.summary.newLeads;
        if (outcome.summary.limitReached) {
          updateResult(i, { message: "Daily limit reached partway; results so far were saved." });
          skipFrom(i + 1, "Daily limit reached.");
          break;
        }
      } else {
        updateResult(i, { status: "error", message: outcome.error });
        if (outcome.status === 429 || outcome.status === 401 || outcome.status === 503) {
          skipFrom(i + 1, outcome.status === 429 ? "Daily limit reached." : "Not run.");
          break;
        }
      }
    }

    setRunning(false);
    router.refresh(); // update recent searches and stale count
    // New leads with websites join the scoring queue; start working through it.
    if (newLeads > 0) scoring.start();
  }

  function skipFrom(start: number, message: string) {
    setResults((prev) => prev.map((r, i) => (i >= start && r.status === "pending" ? { ...r, status: "skipped", message } : r)));
  }

  const doneCount = results.filter((r) => r.status === "done" || r.status === "error" || r.status === "skipped").length;
  const totalNew = results.reduce((sum, r) => sum + (r.summary?.newLeads ?? 0), 0);

  return (
    <section className="card space-y-5" aria-labelledby="search-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="search-heading" className="text-lg font-medium">
          Search
        </h2>
        <fieldset className="flex gap-1" disabled={running}>
          <legend className="sr-only">Search mode</legend>
          {(["single", "bulk"] as const).map((m) => (
            <label
              key={m}
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-md border px-4 text-xs font-medium tracking-[0.18em] uppercase transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-accent-500 ${
                mode === m
                  ? "border-accent-500 bg-accent-500/12 text-accent-400"
                  : "border-neutral-500 text-neutral-200 hover:border-neutral-300"
              }`}
            >
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
              {m === "single" ? "One town" : "Several towns"}
            </label>
          ))}
        </fieldset>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="trade" className="field-label">
              Trade
            </label>
            <select
              id="trade"
              className="field-input"
              value={tradeChoice}
              onChange={(e) => setTradeChoice(e.target.value)}
              disabled={running}
            >
              {TRADE_PRESETS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value={CUSTOM}>Custom…</option>
            </select>
          </div>
          {tradeChoice === CUSTOM && (
            <div>
              <label htmlFor="custom-trade" className="field-label">
                Custom trade
              </label>
              <input
                id="custom-trade"
                className="field-input"
                value={customTrade}
                onChange={(e) => setCustomTrade(e.target.value)}
                placeholder="e.g. tree service"
                maxLength={60}
                disabled={running}
              />
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {mode === "single" ? (
            <div className="sm:col-span-1">
              <label htmlFor="city" className="field-label">
                Town
              </label>
              <input
                id="city"
                className="field-input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Mansfield"
                autoComplete="off"
                maxLength={60}
                disabled={running}
              />
            </div>
          ) : (
            <div className="sm:col-span-3">
              <label htmlFor="towns" className="field-label">
                Towns, one per line
              </label>
              <textarea
                id="towns"
                className="field-input min-h-32 py-2"
                value={townsText}
                onChange={(e) => setTownsText(e.target.value)}
                placeholder={"Mansfield\nFoxborough\nNashua, NH"}
                aria-describedby="towns-hint"
                disabled={running}
              />
              <p id="towns-hint" className="mt-1 text-sm text-muted">
                Add &quot;, NH&quot; or &quot;, RI&quot; to override the state below. Up to {MAX_BULK_TOWNS} towns; they run
                one after another.
              </p>
            </div>
          )}
          <div>
            <label htmlFor="state" className="field-label">
              {mode === "single" ? "State" : "Default state"}
            </label>
            <select
              id="state"
              className="field-input"
              value={state}
              onChange={(e) => setState(e.target.value as State)}
              disabled={running}
            >
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="radius" className="field-label">
              Radius
            </label>
            <select
              id="radius"
              className="field-input"
              value={radiusM}
              onChange={(e) => setRadiusM(Number(e.target.value))}
              disabled={running}
            >
              {RADIUS_OPTIONS.map((r) => (
                <option key={r.meters} value={r.meters}>
                  {r.miles} miles
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="alert-info" aria-live="polite">
          <p>
            <strong>Estimate:</strong> up to {estimate} Places request{estimate === 1 ? "" : "s"}
            {towns.length > 0 && ` (${towns.length} town${towns.length === 1 ? "" : "s"} × up to ${MAX_REQUESTS_PER_TOWN})`}.
          </p>
          <p>
            Used today: {usage.used} of {usage.limit}. {remaining} left.
          </p>
          {estimate > remaining && remaining > 0 && (
            <p className="mt-1 font-medium text-warning">
              This may stop partway. Results from finished pages are still saved.
            </p>
          )}
        </div>

        {formError && (
          <p role="alert" className="alert-error">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary" disabled={running}>
            {running ? "Searching…" : "Find leads"}
          </button>
          {running && towns.length > 1 && (
            <button type="button" className="btn-secondary" onClick={() => (stopRequested.current = true)}>
              Stop after this town
            </button>
          )}
        </div>
      </form>

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium" role="status" aria-live="polite">
            {running ? `Searching ${doneCount + 1} of ${results.length}…` : `Finished. ${totalNew} new lead${totalNew === 1 ? "" : "s"} added.`}
          </p>
          <ul className="space-y-2">
            {results.map((r, i) => (
              <li key={`${r.town.city}-${r.town.state}-${i}`}>
                <TownResultCard result={r} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function TownResultCard({ result }: { result: TownResult }) {
  const { town, status, summary, message } = result;
  const label = `${town.city}, ${town.state}`;

  if (status !== "done" || !summary) {
    const text = { pending: "Waiting", running: "Searching…", error: message ?? "Failed", skipped: message ?? "Skipped", done: "" }[status];
    return (
      <div className={`rounded-md border p-3 text-sm ${status === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-divider"}`}>
        <span className="font-medium">{label}:</span> {text}
      </div>
    );
  }

  const skipped = [
    summary.skippedClosed && `${summary.skippedClosed} permanently closed`,
    summary.skippedOutsideRadius && `${summary.skippedOutsideRadius} outside radius`,
    summary.skippedSuppressed && `${summary.skippedSuppressed} on do-not-contact list`,
  ].filter(Boolean);

  return (
    <details className="rounded-md border border-divider p-3 text-sm">
      <summary className="cursor-pointer">
        <span className="font-medium">{label}:</span> {summary.resultsFound} found, {summary.newLeads} new,{" "}
        {summary.updatedLeads} already in list. {summary.requestsUsed} requests.
        {skipped.length > 0 && <span className="text-muted"> Skipped: {skipped.join(", ")}.</span>}
        {message && <span className="font-medium text-warning"> {message}</span>}
      </summary>
      {summary.businesses.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Business</th>
                <th scope="col" className="py-1 pr-3 font-medium">Town</th>
                <th scope="col" className="py-1 pr-3 font-medium">Phone</th>
                <th scope="col" className="py-1 pr-3 font-medium">Website</th>
                <th scope="col" className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {summary.businesses.map((b) => (
                <tr key={b.place_id}>
                  <td className="py-1 pr-3">{b.business_name}</td>
                  <td className="py-1 pr-3">{b.city ?? "—"}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">{b.phone ?? "none"}</td>
                  <td className="py-1 pr-3">
                    {b.website_url ? (
                      <a href={b.website_url} target="_blank" rel="noopener noreferrer" className="btn-link">
                        site
                      </a>
                    ) : (
                      <strong>none</strong>
                    )}
                  </td>
                  <td className="py-1">{b.isNew ? "New" : "Updated"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

type SearchOutcome =
  | { ok: true; summary: SearchSummary; usage: Usage }
  | { ok: false; status: number; error: string; usage?: Usage };

async function searchTown(body: { trade: string; city: string; state: State; radiusM: number }): Promise<SearchOutcome> {
  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return { ok: true, summary: data as SearchSummary, usage: (data as SearchSummary).usage };
    if (response.status === 401) return { ok: false, status: 401, error: "Signed out. Reload the page and sign in again." };
    return { ok: false, status: response.status, error: data.error ?? `Request failed (${response.status}).`, usage: data.usage };
  } catch {
    return { ok: false, status: 0, error: "Network error. Check your connection." };
  }
}
