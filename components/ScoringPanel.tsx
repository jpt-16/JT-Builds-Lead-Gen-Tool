"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useScoring } from "@/components/ScoringProvider";

export function ScoringPanel({ pending, failed }: { pending: number; failed: number }) {
  const router = useRouter();
  const { state, start, stop } = useScoring();
  const [recomputing, setRecomputing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const left = state.running && state.pending !== null ? state.pending : pending;

  async function recompute() {
    setRecomputing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/leads/recompute", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      setMessage(response.ok ? `Recalculated. ${data.updated} lead${data.updated === 1 ? "" : "s"} changed.` : (data.error ?? "Failed."));
    } catch {
      setMessage("Network error.");
    }
    setRecomputing(false);
    router.refresh();
  }

  return (
    <section className="card space-y-4" aria-labelledby="scoring-heading">
      <div>
        <p className="eyebrow">Website scoring</p>
        <h2 id="scoring-heading" className="mt-1 text-lg">
          {left} site{left === 1 ? "" : "s"} waiting to be checked
        </h2>
        <p className="mt-1 text-sm text-muted">
          One site at a time with a pause between, so a big batch never hammers anyone. Each takes 10 to 60 seconds.
          {failed > 0 && ` ${failed} could not be checked after 3 tries.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {state.running ? (
          <button type="button" className="btn-secondary" onClick={stop}>
            Stop after this one
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={start} disabled={left === 0}>
            Score websites now
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={recompute} disabled={recomputing}>
          {recomputing ? "Recalculating…" : "Recalculate priorities"}
        </button>
      </div>

      <div aria-live="polite" className="space-y-2 text-sm">
        {message && <p className="alert-info">{message}</p>}
        {state.recent.length > 0 && (
          <ul className="space-y-1">
            {state.recent.map((lead) => (
              <li key={lead.id}>
                <span className="text-ink">{lead.business_name}</span>{" "}
                <span className="text-muted">
                  {lead.error ?? describe(lead.site_status, lead.score_total)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function describe(siteStatus: string | null, score: number | null): string {
  switch (siteStatus) {
    case "ok":
      return `scored ${score}/100`;
    case "blocked":
      return score !== null ? `scored ${score}/100 (homepage blocked)` : "blocked our check";
    case "dead":
      return "site is down";
    case "parked":
      return "parked or placeholder";
    case "social":
      return "social page only";
    case "none":
      return "no website";
    default:
      return "checked";
  }
}
