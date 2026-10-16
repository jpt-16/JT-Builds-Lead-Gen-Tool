"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useScoring } from "@/components/ScoringProvider";
import type { HealthDistribution } from "@/lib/call-list";

// Website health across all leads, plus the scoring controls. The bands are
// status-like (weak / fair / good), so they use the gauge colours; every
// segment is also named with its count in the legend, never colour alone.

const SEGMENTS = [
  { key: "noRealSite", label: "No real website", color: "var(--color-accent)", href: "/leads?site=no_real" },
  { key: "weak", label: "Weak site (under 50)", color: "var(--color-gauge-bad)", href: "/leads?scoreMax=49" },
  { key: "fair", label: "Fair site (50 to 79)", color: "var(--color-gauge-mid)", href: "/leads?scoreMin=50&scoreMax=79" },
  { key: "good", label: "Good site (80+)", color: "var(--color-gauge-good)", href: "/leads?scoreMin=80" },
  { key: "unchecked", label: "Not checked yet", color: "var(--color-line-strong)", href: null },
] as const;

export function WebsiteHealthCard({ dist, pending, failed }: { dist: HealthDistribution; pending: number; failed: number }) {
  const router = useRouter();
  const { state, start, stop } = useScoring();
  const [recomputing, setRecomputing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const total = SEGMENTS.reduce((sum, s) => sum + dist[s.key], 0);
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
    <section className="card flex flex-col" aria-labelledby="health-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="health-heading" className="text-base font-semibold text-ink">
          Website health
        </h2>
        <span className="text-xs text-muted">{total} leads</span>
      </div>

      <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
        {SEGMENTS.map((s) =>
          dist[s.key] > 0 ? (
            <span key={s.key} style={{ flexGrow: dist[s.key], background: s.color }} title={`${s.label}: ${dist[s.key]}`} />
          ) : null,
        )}
      </div>

      <ul className="mt-4 space-y-1.5 text-sm">
        {SEGMENTS.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            {s.href ? (
              <Link href={s.href} className="flex-1 text-ink-2 hover:text-accent hover:underline">
                {s.label}
              </Link>
            ) : (
              <span className="flex-1 text-ink-2">{s.label}</span>
            )}
            <span className="font-semibold text-ink tabular-nums">{dist[s.key]}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-4">
        <p className="text-xs text-muted">
          {left} waiting to be checked{failed > 0 ? `, ${failed} failed after 3 tries` : ""}. One site at a time, 10 to 60 seconds each.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
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
        <div aria-live="polite">{message && <p className="mt-2 text-sm text-ink-2">{message}</p>}</div>
      </div>
    </section>
  );
}
