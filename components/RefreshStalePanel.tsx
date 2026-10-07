"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RefreshSummary } from "@/lib/find-leads-config";

const BATCH = 20;

export function RefreshStalePanel({ staleCount }: { staleCount: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RefreshSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/leads/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: BATCH }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setResult(data as RefreshSummary);
      else setError(data.error ?? `Refresh failed (${response.status}).`);
    } catch {
      setError("Network error. Check your connection.");
    }
    setRunning(false);
    router.refresh();
  }

  return (
    <section className="card space-y-3" aria-labelledby="refresh-heading">
      <h2 id="refresh-heading" className="text-lg font-medium">
        Refresh stale leads
      </h2>
      <p className="text-sm text-muted">
        Google data on a lead (name, phone, website, reviews) is re-fetched after 30 days. Each lead uses one Places
        request.
      </p>
      <p>
        <strong>{staleCount}</strong> lead{staleCount === 1 ? "" : "s"} older than 30 days.
      </p>
      <button type="button" className="btn-secondary" onClick={refresh} disabled={running || staleCount === 0}>
        {running ? "Refreshing…" : `Refresh up to ${Math.min(BATCH, staleCount) || BATCH}`}
      </button>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="alert-error">
            {error}
          </p>
        )}
        {result && (
          <p className="alert-success">
            Refreshed {result.refreshed}.
            {result.notFound > 0 && ` ${result.notFound} no longer found on Google.`}
            {result.nowClosed.length > 0 && ` Now permanently closed: ${result.nowClosed.join(", ")}.`}
            {result.limitReached && " Stopped at the daily Places limit."} {result.remainingStale} still stale.
          </p>
        )}
      </div>
    </section>
  );
}
