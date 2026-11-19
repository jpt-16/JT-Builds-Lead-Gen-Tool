import { beforeEach, describe, expect, it, vi } from "vitest";
import { bulkUpdate, DoNotContactLockedError, NotDoNotContactError, removeFromDoNotContact, updateLead } from "./lead-actions";

vi.mock("./derived", () => ({ recomputeDerived: vi.fn().mockResolvedValue(0) }));

type Lead = { id: string; status: string; phone: string | null; business_name: string };
type SuppressionRow = { id: string; phone: string | null; email: string | null; business_name: string | null };

/**
 * A just-enough fake of the supabase-js calls lead-actions makes. `log` records
 * each write in order so tests can check what happens first.
 */
function fake(opts: { leads?: Lead[]; suppression?: SuppressionRow[]; failOn?: string } = {}) {
  const leads = opts.leads ?? [];
  const suppression = opts.suppression ?? [];
  const log: string[] = [];
  const writes: Record<string, unknown[]> = {};

  const from = (table: string) => {
    let op = "select";
    let payload: unknown;
    let ids: string[] | null = null;
    let eqId: string | null = null;
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (p: unknown) => ((op = "insert"), (payload = p), builder),
      update: (p: unknown) => ((op = "update"), (payload = p), builder),
      delete: () => ((op = "delete"), builder),
      in: (_col: string, values: string[]) => ((ids = values), builder),
      eq: (_col: string, value: string) => ((eqId = value), builder),
      maybeSingle: () => builder,
      single: () => builder,
      then: (resolve: (value: unknown) => void) => {
        const key = `${table}.${op}`;
        if (op !== "select") {
          log.push(key);
          (writes[key] ??= []).push({ payload, ids, eqId });
        }
        if (opts.failOn === key) return resolve({ data: null, error: { message: `${key} failed` } });
        if (table === "leads" && op === "select") {
          const rows = ids ? leads.filter((l) => ids!.includes(l.id)) : leads.filter((l) => l.id === eqId);
          return resolve({ data: ids ? rows : (rows[0] ?? null), error: null });
        }
        if (table === "suppression" && op === "select") return resolve({ data: suppression, error: null });
        if (op === "update" && table === "leads")
          return resolve({ data: { id: eqId, status: (payload as { status?: string }).status ?? "new" }, error: null });
        resolve({ data: null, error: null });
      },
    };
    return builder;
  };
  return { supabase: { from } as never, log, writes };
}

const lead = (id: string, status: string, over: Partial<Lead> = {}): Lead => ({
  id,
  status,
  phone: "(508) 555-0100",
  business_name: `Business ${id}`,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("updateLead and do-not-contact", () => {
  it("refuses to move a do-not-contact lead to any other status, and writes nothing", async () => {
    const { supabase, log } = fake({ leads: [lead("a", "do_not_contact")] });
    for (const status of ["new", "queued", "contacted", "lost"] as const) {
      await expect(updateLead(supabase, "a", { status })).rejects.toBeInstanceOf(DoNotContactLockedError);
    }
    expect(log).toEqual([]);
  });

  it("still lets notes and follow-ups be edited on a do-not-contact lead", async () => {
    const { supabase, log } = fake({ leads: [lead("a", "do_not_contact")] });
    await updateLead(supabase, "a", { notes: "asked not to be called" });
    expect(log).toEqual(["leads.update"]);
  });

  it("adds the suppression row before changing the status", async () => {
    const { supabase, log, writes } = fake({ leads: [lead("a", "contacted")] });
    await updateLead(supabase, "a", { status: "do_not_contact", dnc_reason: "asked to stop" });
    expect(log).toEqual(["suppression.insert", "leads.update"]);
    expect((writes["suppression.insert"][0] as { payload: unknown[] }).payload).toEqual([
      { phone: "5085550100", business_name: "Business a", reason: "asked to stop" },
    ]);
  });

  it("leaves the status alone if the suppression write fails", async () => {
    const { supabase, log } = fake({ leads: [lead("a", "contacted")], failOn: "suppression.insert" });
    await expect(updateLead(supabase, "a", { status: "do_not_contact" })).rejects.toThrow("do-not-contact list");
    expect(log).toEqual(["suppression.insert"]);
  });

  it("does not add a duplicate row for a business that is already listed", async () => {
    const { supabase, log } = fake({
      leads: [lead("a", "contacted")],
      suppression: [{ id: "s1", phone: "5085550100", email: null, business_name: "Business a" }],
    });
    await updateLead(supabase, "a", { status: "do_not_contact" });
    expect(log).toEqual(["leads.update"]);
  });
});

describe("bulkUpdate and do-not-contact", () => {
  const leads = [lead("a", "do_not_contact"), lead("b", "new"), lead("c", "contacted")];

  it("skips do-not-contact leads when setting any other status", async () => {
    const { supabase, writes } = fake({ leads });
    const result = await bulkUpdate(supabase, ["a", "b", "c"], { type: "set_status", status: "queued" });
    expect(result).toEqual({ updated: 2, skipped: 1 });
    expect((writes["leads.update"][0] as { ids: string[] }).ids).toEqual(["b", "c"]);
  });

  it("changes nothing when every selected lead is do-not-contact", async () => {
    const { supabase, log } = fake({ leads });
    expect(await bulkUpdate(supabase, ["a"], { type: "set_status", status: "new" })).toEqual({ updated: 0, skipped: 1 });
    expect(log).toEqual([]);
  });

  it("adds suppression for the leads being marked, before changing their status, and not for ones already marked", async () => {
    const { supabase, log, writes } = fake({ leads });
    const result = await bulkUpdate(supabase, ["a", "b", "c"], { type: "set_status", status: "do_not_contact" });
    expect(result).toEqual({ updated: 3, skipped: 0 });
    expect(log).toEqual(["suppression.insert", "leads.update"]);
    const inserted = (writes["suppression.insert"][0] as { payload: { business_name: string }[] }).payload.map((r) => r.business_name);
    expect(inserted).toEqual(["Business b", "Business c"]); // a is already on the list, so it is not added again
  });

  it("still only queues new leads that are not suppressed", async () => {
    const { supabase, writes } = fake({ leads, suppression: [{ id: "s", phone: null, email: null, business_name: "Business b" }] });
    const result = await bulkUpdate(supabase, ["a", "b", "c"], { type: "queue" });
    expect(result).toEqual({ updated: 0, skipped: 3 });
    expect(writes["leads.update"]).toBeUndefined();
  });
});

describe("removeFromDoNotContact", () => {
  const dnc = lead("a", "do_not_contact", { phone: "(508) 555-0100", business_name: "Acme Landscaping LLC" });

  it("refuses for a lead that is not on the list", async () => {
    const { supabase, log } = fake({ leads: [lead("a", "new")] });
    await expect(removeFromDoNotContact(supabase, "a")).rejects.toBeInstanceOf(NotDoNotContactError);
    expect(log).toEqual([]);
  });

  it("sets the lead back to New first, then removes only the rows made for it", async () => {
    const { supabase, log, writes } = fake({
      leads: [dnc],
      suppression: [
        { id: "own-phone", phone: "5085550100", email: null, business_name: "Acme Landscaping LLC" },
        { id: "own-name", phone: null, email: null, business_name: "acme landscaping" },
        { id: "other-phone", phone: "5085559999", email: null, business_name: "Someone Else" },
      ],
    });
    const result = await removeFromDoNotContact(supabase, "a");
    expect(log).toEqual(["leads.update", "suppression.delete"]);
    expect((writes["suppression.delete"][0] as { ids: string[] }).ids).toEqual(["own-phone", "own-name"]);
    expect(result).toEqual({ status: "new", removed: 2, stillSuppressed: false });
  });

  it("reports when another business with the same name still suppresses it", async () => {
    const { supabase, writes } = fake({
      leads: [dnc],
      suppression: [
        { id: "own", phone: "5085550100", email: null, business_name: "Acme Landscaping" },
        { id: "branch", phone: "6035550123", email: null, business_name: "Acme Landscaping, Inc." },
      ],
    });
    const result = await removeFromDoNotContact(supabase, "a");
    expect((writes["suppression.delete"][0] as { ids: string[] }).ids).toEqual(["own"]);
    expect(result.stillSuppressed).toBe(true);
  });

  it("keeps the lead suppressed, not exposed, if removing the rows fails", async () => {
    const { supabase, log } = fake({
      leads: [dnc],
      suppression: [{ id: "own", phone: "5085550100", email: null, business_name: null }],
      failOn: "suppression.delete",
    });
    await expect(removeFromDoNotContact(supabase, "a")).rejects.toThrow("remove from the do-not-contact list");
    // The lead is a normal lead again but is still suppressed, so it can't be queued or emailed.
    expect(log).toEqual(["leads.update", "suppression.delete"]);
  });
});
