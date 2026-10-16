import type { Metadata } from "next";
import Link from "next/link";
import { CallList } from "@/components/CallList";
import { FunnelCard } from "@/components/FunnelCard";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { WebsiteHealthCard } from "@/components/WebsiteHealthCard";
import { weekStarts } from "@/lib/activity";
import { getCallList, getFunnel, getHealthDistribution, getWeeklyActivity } from "@/lib/call-list";
import { getQueueCounts } from "@/lib/score-queue";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard | JT Builds Co Lead Engine" };

const weekLabel = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const passwordChanged = (await searchParams).password === "changed";
  const supabase = await createClient();

  let data;
  try {
    data = await Promise.all([
      getFunnel(supabase),
      getCallList(supabase),
      getQueueCounts(supabase),
      getWeeklyActivity(supabase),
      getHealthDistribution(supabase),
    ]);
  } catch (error) {
    console.error("dashboard:", error instanceof Error ? error.message : error);
    return (
      <>
        <PageHeader crumbs={[{ label: "Dashboard" }]} title="Dashboard" />
        <p role="alert" className="alert-error">
          The database is missing something this page needs. Check that every file in supabase/migrations has been
          applied, then reload.
        </p>
      </>
    );
  }
  const [funnel, calls, queue, activity, health] = data;
  const weekLabels = weekStarts().map((d) => `Week of ${weekLabel.format(d)}`);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Dashboard" }]}
        title="Dashboard"
        description={`${funnel.total} leads · ${calls.due.length + calls.fresh.length} to call today`}
        actions={
          <>
            <Link href="/find" className="btn-secondary">
              Find leads
            </Link>
            <a href="#calls-heading" className="btn-primary">
              Start calling
            </a>
          </>
        }
      />

      <div className="space-y-6">
        {passwordChanged && (
          <p role="status" className="alert-success">
            Password changed.
          </p>
        )}
        <section aria-label="This week" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Leads found" metric={activity.leadsFound} weekLabels={weekLabels} />
          <MetricCard label="Outreach logged" metric={activity.outreach} weekLabels={weekLabels} />
          <MetricCard label="Conversations" metric={activity.conversations} weekLabels={weekLabels} />
          <MetricCard label="Calls booked" metric={activity.booked} weekLabels={weekLabels} />
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <FunnelCard funnel={funnel} />
          <WebsiteHealthCard dist={health} pending={queue.pending} failed={queue.failed} />
        </div>

        <CallList due={calls.due} fresh={calls.fresh} />
      </div>
    </>
  );
}
