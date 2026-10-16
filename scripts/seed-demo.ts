import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/database.types";
import { buildDemoLeads, DEMO_PREFIX } from "../lib/demo-data";
import { computePriority, whyThisLead } from "../lib/priority";

// Adds (or removes) ten fake demo leads so the app can be explored without
// spending Google credits. Run through npm:
//   npm run seed:demo          add or refresh the demo leads
//   npm run seed:demo:remove   delete only the demo leads and their history
//
// It touches only rows whose place_id starts with "demo-". It reads the
// project URL, the service key and the owner email from .env.local, and never
// prints the key.

const remove = process.argv.includes("--remove");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const ownerEmail = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
if (!url || !secretKey || !ownerEmail) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and ALLOWED_EMAIL in .env.local first.");
  process.exit(1);
}

const supabase = createClient<Database>(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findOwnerId(): Promise<string> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`Could not look up the owner account: ${error.message}`);
    const owner = data.users.find((u) => u.email?.toLowerCase() === ownerEmail);
    if (owner) return owner.id;
    if (data.users.length < 100) break;
  }
  throw new Error(`No account found for ${ownerEmail}. Sign up in the app first.`);
}

async function removeDemo(): Promise<number> {
  const { data: leads, error } = await supabase.from("leads").select("id").like("place_id", `${DEMO_PREFIX}%`);
  if (error) throw new Error(`Could not list demo leads: ${error.message}`);
  const ids = (leads ?? []).map((l) => l.id);
  if (!ids.length) return 0;
  const { error: logError } = await supabase.from("outreach_log").delete().in("lead_id", ids);
  if (logError) throw new Error(`Could not remove demo history: ${logError.message}`);
  const { error: leadError } = await supabase.from("leads").delete().in("id", ids);
  if (leadError) throw new Error(`Could not remove demo leads: ${leadError.message}`);
  return ids.length;
}

async function seed() {
  const ownerId = await findOwnerId();
  const demo = buildDemoLeads(new Date());

  const { data: inserted, error } = await supabase
    .from("leads")
    .insert(demo.map(({ lead }) => ({ ...lead, owner_id: ownerId })))
    .select("id, place_id");
  if (error) throw new Error(`Could not add demo leads: ${error.message}`);
  const idByPlace = new Map((inserted ?? []).map((row) => [row.place_id, row.id]));

  const now = Date.now();
  const logs = demo.flatMap(({ lead, logs: entries }) =>
    entries.map((entry) => ({
      owner_id: ownerId,
      lead_id: idByPlace.get(lead.place_id)!,
      channel: entry.channel,
      outcome: entry.outcome,
      note: entry.note,
      created_at: new Date(now - entry.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    })),
  );
  if (logs.length) {
    const { error: logError } = await supabase.from("outreach_log").insert(logs);
    if (logError) throw new Error(`Could not add demo history: ${logError.message}`);
  }

  // Priority and the "why this lead" line come from the same functions the app uses.
  const payload = demo.map(({ lead }) => {
    const row = {
      status: lead.status ?? "new",
      site_status: lead.site_status ?? null,
      score_total: lead.score_total ?? null,
      score_breakdown: lead.score_breakdown ?? null,
      review_count: lead.review_count ?? 0,
      rating: lead.rating ?? null,
      phone: lead.phone ?? null,
      website_url: lead.website_url ?? null,
      trade: lead.trade ?? null,
      city: lead.city ?? null,
      state: lead.state ?? null,
    };
    return { id: idByPlace.get(lead.place_id)!, priority_score: computePriority(row), why_this_lead: whyThisLead(row) };
  });
  const { error: priorityError } = await supabase.rpc("set_lead_priorities", { payload });
  if (priorityError) throw new Error(`Could not save demo priorities: ${priorityError.message}`);

  return { leads: demo.length, logs: logs.length };
}

async function main() {
  const host = new URL(url!).host;
  if (remove) {
    const count = await removeDemo();
    console.log(`Removed ${count} demo lead${count === 1 ? "" : "s"} (and their history) from ${host}.`);
    return;
  }
  const replaced = await removeDemo();
  const added = await seed();
  console.log(
    `${replaced ? `Replaced ${replaced} existing demo leads. ` : ""}Added ${added.leads} demo leads and ${added.logs} outreach entries to ${host}.`,
  );
  console.log('Open the app: they\'re named "Demo ...". Remove them any time with: npm run seed:demo:remove');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
