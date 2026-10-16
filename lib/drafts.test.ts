import { describe, expect, it } from "vitest";
import { buildDrafts, composeEmail, draftFacts, type DraftLead, type EmailDraft, emailComplianceProblem, siteProblems, tradePlural } from "./drafts";
import { OPT_OUT_LINE, type OutreachConfig } from "./outreach-config";

const config: OutreachConfig = { senderName: "Sam", callbackPhone: "(781) 555-0100", mailingAddress: "PO Box 12, Mansfield, MA 02048" };

const base: DraftLead = {
  business_name: "Alpha Lawn",
  trade: "landscaper",
  city: "Mansfield",
  state: "MA",
  review_count: 6,
  rating: 4.2,
  website_url: null,
  site_status: "none",
  score_total: null,
  score_breakdown: null,
};

const scored: DraftLead = {
  ...base,
  business_name: "Delta Roofing",
  trade: "roofer",
  website_url: "https://www.deltaroofing.example/",
  site_status: "ok",
  score_total: 42,
  score_breakdown: {
    deductions: [
      { check: "performance", points: 14, short: "slow on mobile", message: "" },
      { check: "click_to_call", points: 10, short: "no click-to-call", message: "" },
      { check: "contact", points: 10, short: "no way to request service", message: "" },
      { check: "lcp", points: 5, short: "slow to load", message: "" },
      { check: "schema", points: 5, short: "no LocalBusiness schema", message: "" },
    ],
    metrics: { performance: 31, lcpMs: 6200, cls: 0.05 },
  },
};

const email = (d: ReturnType<typeof buildDrafts>["email"]) => d as EmailDraft;
const allText = (lead: DraftLead, c = config) => {
  const d = buildDrafts(lead, c);
  return [d.call, d.voicemail, composeEmail(email(d.email)), email(d.email).subject, composeEmail(email(d.followUp)), email(d.followUp).subject].join("\n");
};

const VARIANTS: DraftLead[] = [
  base,
  { ...base, site_status: "social", website_url: "https://facebook.com/alphalawn" },
  { ...base, site_status: "dead", website_url: "http://alphalawn.example" },
  { ...base, site_status: "parked", website_url: "alphalawn.example" },
  scored,
  { ...scored, score_total: 96, score_breakdown: { deductions: [], metrics: { performance: 95, lcpMs: 1800, cls: 0 } } },
  { ...scored, score_total: null, score_breakdown: null },
  { ...scored, site_status: "blocked" },
  { ...base, trade: null, city: null, state: null, review_count: 0, rating: null },
];

describe("buildDrafts", () => {
  it("never uses exclamation marks, in any variant", () => {
    for (const lead of VARIANTS) expect(allText(lead)).not.toContain("!");
  });

  it("puts the business name, opt-out line and mailing address in every email", () => {
    for (const lead of VARIANTS) {
      const d = buildDrafts(lead, config);
      for (const e of [email(d.email), email(d.followUp)]) {
        const text = composeEmail(e);
        expect(text).toContain("JT Builds Co");
        expect(text).toContain(OPT_OUT_LINE);
        expect(text).toContain(config.mailingAddress);
        expect(emailComplianceProblem(text, config.mailingAddress!)).toBeNull();
        // The footer comes last, after the signature.
        expect(text.trimEnd().endsWith(config.mailingAddress!)).toBe(true);
      }
    }
  });

  it("blocks email drafts without a mailing address, but keeps call scripts", () => {
    const d = buildDrafts(base, { ...config, mailingAddress: null });
    expect(d.email).toEqual({ blocked: expect.stringContaining("BUSINESS_MAILING_ADDRESS") });
    expect(d.followUp).toEqual({ blocked: expect.stringContaining("BUSINESS_MAILING_ADDRESS") });
    expect(d.call).toContain("Alpha Lawn");
  });

  it("names the specific finding for each kind of website", () => {
    expect(allText(base)).toContain("doesn't link to a website");
    expect(allText(VARIANTS[1])).toContain("goes to your Facebook page");
    expect(allText(VARIANTS[2])).toContain("alphalawn.example, didn't load when I checked");
    expect(allText(VARIANTS[3])).toContain("shows a parked page");
  });

  it("lists the biggest website problems for a scored site", () => {
    const body = email(buildDrafts(scored, config).email).body;
    expect(body).toContain("Delta Roofing's homepage (deltaroofing.example)");
    expect(body).toContain("- Your homepage scores 31 out of 100 on Google's mobile speed test.");
    expect(body).toContain("- There's no contact form or booking link");
    expect(body).toContain("- The phone number on your homepage can't be tapped to call.");
    // Only the top three make it in.
    expect(body).not.toContain("6.2 seconds");
    expect(body).not.toContain("LocalBusiness");
    expect(buildDrafts(scored, config).voicemail).toContain("I looked at your website. Your homepage scores 31 out of 100");
  });

  it("mentions the review count", () => {
    expect(email(buildDrafts(base, config).email).body).toContain("The listing has 6 reviews at 4.2 stars");
    expect(email(buildDrafts({ ...base, review_count: 48, rating: 4.8 }, config).email).body).toContain(
      "You have 48 reviews at 4.8 stars, so people already find you and rate you well. A website is the missing piece.",
    );
    expect(email(buildDrafts({ ...base, review_count: 1, rating: null }, config).email).body).toContain("The listing has 1 review,");
  });

  it("uses an owner-neutral greeting and the trade", () => {
    const d = buildDrafts(base, config);
    expect(email(d.email).body.startsWith("Hello,")).toBe(true);
    expect(d.call).toContain("Am I speaking with the owner?");
    expect(d.call).toContain("I build websites for landscapers around Mansfield");
    expect(email(d.email).body).toContain('searches "landscaper Mansfield"');
  });

  it("puts the callback number twice in the voicemail", () => {
    expect(buildDrafts(base, config).voicemail.split(config.callbackPhone!).length - 1).toBe(2);
  });

  it("uses placeholders and warns when the sender details are missing", () => {
    const d = buildDrafts(base, { ...config, senderName: null, callbackPhone: null });
    expect(d.voicemail).toContain("[your name]");
    expect(d.voicemail).toContain("[your callback number]");
    expect(d.warnings).toHaveLength(2);
  });

  it("warns instead of guessing when the site hasn't been checked", () => {
    const d = buildDrafts(VARIANTS[6], config);
    expect(d.warnings.join(" ")).toContain("hasn't been checked yet");
    expect(d.basedOn[0]).toBe("Website not checked yet");
    expect(buildDrafts(VARIANTS[7], config).warnings.join(" ")).toContain("blocked the automatic check");
  });
});

describe("good websites", () => {
  const good: DraftLead = {
    ...scored,
    score_total: 86,
    score_breakdown: { deductions: [{ check: "click_to_call", points: 10, short: "", message: "" }], metrics: { performance: 92, lcpMs: 1900, cls: 0 } },
  };

  it("pitches follow-up automation instead of a website, with no price", () => {
    const d = buildDrafts(good, config);
    const text = allText(good);
    expect(text).toContain("it's in good shape");
    expect(text).toContain("quote form");
    expect(text).toContain("missed call");
    expect(text).toContain("review");
    expect(text).not.toContain("$97");
    expect(text).not.toMatch(/2 for 1|two for one|bundle/i);
    expect(email(d.email).subject).toBe("Quote requests and missed calls at Delta Roofing");
    expect(d.basedOn[0]).toContain("follow-up automation");
    expect(draftFacts(good).pitch).toContain("automation");
  });

  it("keeps the website pitch for weak sites", () => {
    expect(allText(scored)).toContain("$97");
    expect(draftFacts(scored).pitch).toBe("website");
  });
});

describe("emailComplianceProblem", () => {
  it("catches an edited-out opt-out line or address", () => {
    const text = composeEmail(email(buildDrafts(base, config).email));
    expect(emailComplianceProblem(text.replace(OPT_OUT_LINE, ""), config.mailingAddress!)).toContain("opt-out line");
    expect(emailComplianceProblem(text.replace(config.mailingAddress!, ""), config.mailingAddress!)).toContain("mailing address");
  });
});

describe("helpers", () => {
  it("pluralizes trades", () => {
    expect(tradePlural("house cleaner")).toBe("house cleaners");
    expect(tradePlural("HVAC")).toBe("HVAC businesses");
    expect(tradePlural(null)).toBe("local service businesses");
  });

  it("skips minor speed issues", () => {
    expect(siteProblems({ deductions: [{ check: "performance", points: 4, short: "", message: "" }], metrics: { performance: 80, lcpMs: 2000, cls: 0 } })).toEqual([]);
  });

  it("gives the AI only public facts", () => {
    const facts = draftFacts({ ...scored, notes: "owner is rude", phone: "(508) 555-0004" } as DraftLead);
    expect(JSON.stringify(facts)).not.toMatch(/rude|555-0004/);
    expect(facts.website_problems).toHaveLength(3);
  });
});
