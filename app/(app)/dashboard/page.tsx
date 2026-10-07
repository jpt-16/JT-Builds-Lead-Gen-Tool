import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard | JT Builds Co Lead Engine" };

// Phase 1 placeholder: confirms auth and the database are wired up.
// The call list and stats replace this in Phase 4.
export default async function DashboardPage() {
  const supabase = await createClient();
  const { count, error } = await supabase.from("leads").select("id", { count: "exact", head: true });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <section className="card space-y-2" aria-labelledby="setup-heading">
        <h2 id="setup-heading" className="text-lg font-semibold">
          Setup check
        </h2>
        <p>Signed in as the owner.</p>
        {error ? (
          <p role="alert" className="alert-error">
            Database not ready (code {error.code || "unknown"}). Apply the migrations in supabase/migrations, then
            reload.
          </p>
        ) : (
          <p className="alert-success">Database connected. {count ?? 0} leads visible to this account.</p>
        )}
        <p className="text-sm text-slate-600">The call list arrives in Phase 4.</p>
      </section>
    </div>
  );
}
