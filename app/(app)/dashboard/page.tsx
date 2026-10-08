import type { Metadata } from "next";
import { CallList } from "@/components/CallList";
import { ScoringPanel } from "@/components/ScoringPanel";
import { StatsRow } from "@/components/StatsRow";
import { getCallList, getFunnel } from "@/lib/call-list";
import { getQueueCounts } from "@/lib/score-queue";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard | JT Builds Co Lead Engine" };

export default async function DashboardPage() {
  const supabase = await createClient();

  let data;
  try {
    data = await Promise.all([getFunnel(supabase), getCallList(supabase), getQueueCounts(supabase)]);
  } catch (error) {
    console.error("dashboard:", error instanceof Error ? error.message : error);
    return (
      <div className="space-y-4">
        <h1 className="text-3xl tracking-tight">Dashboard</h1>
        <p role="alert" className="alert-error">
          The database is missing something this page needs. Check that every file in supabase/migrations has been
          applied, then reload.
        </p>
      </div>
    );
  }
  const [funnel, calls, queue] = data;

  return (
    <div className="space-y-10">
      <h1 className="sr-only">Dashboard</h1>
      <StatsRow funnel={funnel} />
      <CallList due={calls.due} fresh={calls.fresh} />
      <ScoringPanel pending={queue.pending} failed={queue.failed} />
    </div>
  );
}
