"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useRef, useState } from "react";

// Works through the website scoring queue from the browser: one lead per
// request, with a pause between, while I use the app. It lives in the app
// layout, so it keeps going when I move between pages. (The Phase 6 cron job
// drains the same queue when the app is closed.)

type ScoredLead = { id: string; business_name: string; site_status: string | null; score_total: number | null; error?: string };

type ScoringState = {
  running: boolean;
  done: number;
  pending: number | null;
  failed: number;
  recent: ScoredLead[];
  error: string | null;
};

type ScoringApi = { state: ScoringState; start: () => void; stop: () => void };

const ScoringContext = createContext<ScoringApi | null>(null);

const PAUSE_MS = 1500; // between leads
const IDLE_PAUSE_MS = 5000; // when the next lead is claimed by another worker
const MAX_IDLE_ROUNDS = 3;
const REFRESH_EVERY = 3; // re-render the current page every few leads

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ScoringProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<ScoringState>({ running: false, done: 0, pending: null, failed: 0, recent: [], error: null });
  const running = useRef(false);
  const stopRequested = useRef(false);

  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    stopRequested.current = false;
    setState((s) => ({ ...s, running: true, done: 0, recent: [], error: null }));

    let done = 0;
    let idleRounds = 0;
    let networkErrors = 0;
    while (!stopRequested.current) {
      try {
        const response = await fetch("/api/score/next", { method: "POST" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = response.status === 401 ? "Signed out. Reload and sign in." : (data.error ?? `Scoring failed (${response.status}).`);
          setState((s) => ({ ...s, error: message }));
          break;
        }
        networkErrors = 0;
        const lead: ScoredLead | null = data.lead ?? null;
        if (lead) done++;
        setState((s) => ({
          ...s,
          done,
          pending: data.pending,
          failed: data.failed,
          recent: lead ? [lead, ...s.recent].slice(0, 5) : s.recent,
        }));
        if (lead && done % REFRESH_EVERY === 0) router.refresh();

        if (data.pending === 0) break;
        if (!lead) {
          idleRounds++;
          if (idleRounds >= MAX_IDLE_ROUNDS) break;
          await sleep(IDLE_PAUSE_MS);
          continue;
        }
        idleRounds = 0;
        await sleep(PAUSE_MS);
      } catch {
        networkErrors++;
        if (networkErrors >= 3) {
          setState((s) => ({ ...s, error: "Network error. Scoring stopped." }));
          break;
        }
        await sleep(3000);
      }
    }

    running.current = false;
    setState((s) => ({ ...s, running: false }));
    router.refresh();
  }, [router]);

  const stop = useCallback(() => {
    stopRequested.current = true;
  }, []);

  return <ScoringContext.Provider value={{ state, start, stop }}>{children}</ScoringContext.Provider>;
}

export function useScoring(): ScoringApi {
  const api = useContext(ScoringContext);
  if (!api) throw new Error("useScoring must be used inside ScoringProvider");
  return api;
}

/** Compact progress line for the header. */
export function ScoringStatus() {
  const { state, stop } = useScoring();
  const visible = state.running || state.error;

  return (
    <div aria-live="polite" className="min-h-0">
      {visible && (
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2 text-xs tracking-[0.12em] uppercase">
          {state.running ? (
            <>
              <span className="text-accent-400">
                Scoring websites · {state.done} done{state.pending !== null ? ` · ${state.pending} left` : ""}
              </span>
              <button type="button" onClick={stop} className="btn-link min-h-11 normal-case tracking-normal">
                Stop after this one
              </button>
            </>
          ) : (
            <span role="alert" className="text-danger normal-case tracking-normal">
              {state.error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
