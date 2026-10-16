import { BUSINESS_NAME, BUSINESS_SITE, OPT_OUT_LINE, type OutreachConfig } from "@/lib/outreach-config";
import type { ScoreBreakdown } from "@/lib/score-calc";
import { healthBand } from "@/lib/site-issues";
import { normalizeUrl, socialPlatform, type SiteStatus } from "@/lib/website";

// Template outreach drafts: call opener, voicemail, cold email and follow-up.
// Pure, so every sentence can be tested. Each draft is built only from what
// we know about the lead (its Google listing and our website check), never
// from guesses about the business.
//
// Leads with a good website (80+) don't need a new one, so their drafts pitch
// follow-up automation instead. No price is quoted for that yet.
//
// Voice: spare, declarative, first person singular, blunt, education-first.
// No hype, no urgency, no exclamation marks, no claims we can't back up.

export type DraftLead = {
  business_name: string;
  trade: string | null;
  city: string | null;
  state: string | null;
  review_count: number;
  rating: number | null;
  website_url: string | null;
  site_status: SiteStatus | null;
  score_total: number | null;
  score_breakdown: unknown;
};

/** Columns buildDrafts needs, for Supabase selects. */
export const DRAFT_FIELDS = "business_name, trade, city, state, review_count, rating, website_url, site_status, score_total, score_breakdown";

export const DRAFT_KINDS = ["call", "voicemail", "email", "follow_up"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export type EmailDraft = { subject: string; body: string; signature: string; footer: string };
export type BlockedDraft = { blocked: string };

export type Drafts = {
  /** The facts the drafts use, shown so they can be checked before sending. */
  basedOn: string[];
  call: string;
  voicemail: string;
  email: EmailDraft | BlockedDraft;
  followUp: EmailDraft | BlockedDraft;
  warnings: string[];
};

export const MISSING_ADDRESS_MESSAGE =
  "Email drafts are blocked until BUSINESS_MAILING_ADDRESS is set. Add your mailing address to .env.local (or the Vercel env vars) and restart.";

const PRICE_LINE = "It's $97 a month, which covers setup, hosting, maintenance and optimization, and the site goes live within 48 hours.";
// What the follow-up automation does, in the order it's pitched.
const AUTOMATION = [
  "When someone fills out your quote form, they get a reply right away that asks about the job and what they need, so they aren't waiting days to hear back.",
  "When you miss a call, the caller gets a text back so the conversation keeps going.",
  "After a job, the customer gets a text asking for a Google review.",
];

const STATE_NAMES: Record<string, string> = { MA: "Massachusetts", NH: "New Hampshire", RI: "Rhode Island" };

type FindingKind = "none" | "social" | "dead" | "parked" | "site" | "good" | "unchecked";

type Finding = {
  kind: FindingKind;
  /** Opening paragraph of the email. */
  opening: string;
  /** One sentence for the follow-up email. Empty when there's nothing specific. */
  short: string;
  /** One sentence to say on a call or voicemail. */
  spoken: string;
  /** Why it matters, for the email (all problems) and the call (first problem). */
  why: string;
  whySpoken: string;
  subject: string;
  /** Specific website problems, for the site kind only. */
  problems: string[];
  basedOn: string;
  /** What I offer to show them: a new site, or fixes to theirs. */
  verb: "build" | "fix" | "change";
};

export function tradePlural(trade: string | null): string {
  const t = trade?.trim();
  if (!t) return "local service businesses";
  if (/(er|or|ist|ian)$/i.test(t)) return `${t}s`;
  return `${t} businesses`;
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function area(lead: DraftLead): string {
  if (lead.city) return `around ${lead.city}`;
  if (lead.state) return `in ${STATE_NAMES[lead.state] ?? lead.state}`;
  return "in your area";
}

function domainOf(url: string | null): string | null {
  return normalizeUrl(url)?.hostname.replace(/^www\./, "") ?? null;
}

// Website problems worth raising, most important first when points tie.
const PROBLEM_ORDER = ["contact", "click_to_call", "visible_phone", "viewport", "https", "performance", "lcp", "title", "meta_description", "h1", "cls"];

/** Up to three plain-English website problems, biggest point loss first. */
export function siteProblems(breakdown: Partial<ScoreBreakdown>): string[] {
  const deductions = new Map((breakdown.deductions ?? []).map((d) => [d.check, d]));
  const m = breakdown.metrics;

  const text: Record<string, string | null> = {
    performance: m && m.performance < 50 ? `Your homepage scores ${m.performance} out of 100 on Google's mobile speed test.` : null,
    lcp: m && m.lcpMs !== null && m.lcpMs > 4000 ? `The main content takes ${(m.lcpMs / 1000).toFixed(1)} seconds to show up on a phone.` : null,
    cls: m && m.cls !== null && m.cls > 0.25 ? "The page jumps around while it loads." : null,
    https: `Your site doesn't load securely, so browsers label it "Not secure".`,
    viewport: "Your site isn't set up for phones, so it shows a shrunken desktop page.",
    visible_phone: "Your phone number isn't on the homepage.",
    click_to_call: "The phone number on your homepage can't be tapped to call.",
    contact: "There's no contact form or booking link on the homepage, and no link to a contact page.",
    title: "The homepage has no page title, so Google makes one up for search results.",
    meta_description: "There's no search description, so Google writes its own snippet for you.",
    h1: deductions.get("h1")?.short === "no main heading" ? "The homepage has no main headline." : null,
  };

  return PROBLEM_ORDER.filter((check) => deductions.has(check) && text[check])
    .sort((a, b) => deductions.get(b)!.points - deductions.get(a)!.points || PROBLEM_ORDER.indexOf(a) - PROBLEM_ORDER.indexOf(b))
    .slice(0, 3)
    .map((check) => text[check]!);
}

function findingFor(lead: DraftLead): Finding {
  const biz = lead.business_name;
  const domain = domainOf(lead.website_url);
  const search = lead.trade && lead.city ? `"${lead.trade} ${lead.city}"` : null;
  const status: SiteStatus | null = lead.site_status ?? (lead.website_url ? null : "none");

  const unchecked: Finding = {
    kind: "unchecked",
    opening: `I came across ${biz} on Google.`,
    short: "",
    spoken: "I came across your Google listing.",
    why: "",
    whySpoken: "",
    subject: `Website for ${biz}`,
    problems: [],
    basedOn: status === "blocked" ? "Website blocked the automatic check" : "Website not checked yet",
    verb: "change",
  };

  switch (status) {
    case "none":
      return {
        kind: "none",
        opening: `I looked up ${biz} on Google. The listing doesn't link to a website.`,
        short: "Your Google listing doesn't link to a website.",
        spoken: "I noticed your Google listing doesn't link to a website.",
        why: search
          ? `When someone searches ${search} on their phone, your listing is what they see. Without a website, there's nothing else for them to check before they pick who to call.`
          : "When someone finds your listing, there's nothing else for them to check before they pick who to call.",
        whySpoken: "Without one, people have nothing else to check before they pick who to call.",
        subject: `No website on ${possessive(biz)} Google listing`,
        problems: [],
        basedOn: "No website on the Google listing",
        verb: "build",
      };
    case "social": {
      const platform = socialPlatform(lead.website_url) ?? "social media";
      return {
        kind: "social",
        opening: `I looked up ${biz} on Google. The website link on the listing goes to your ${platform} page, not a site of your own.`,
        short: `The website link on your Google listing goes to your ${platform} page.`,
        spoken: `I noticed the website link on your Google listing goes to your ${platform} page.`,
        why: `${platform} is fine for updates, but it isn't yours. You don't control how the page looks or what people see first.`,
        whySpoken: `${platform} is fine for updates, but you don't control how it looks or what people see first.`,
        subject: `${possessive(biz)} Google listing links to ${platform}`,
        problems: [],
        basedOn: `Google listing links to ${platform}, not a website`,
        verb: "build",
      };
    }
    case "dead":
      return {
        kind: "dead",
        opening: `I looked up ${biz} on Google. The website on the listing${domain ? `, ${domain},` : ""} didn't load when I checked.`,
        short: "The website on your Google listing didn't load when I checked.",
        spoken: "I tried the website on your Google listing and it didn't load.",
        why: "Anyone who taps that link gets an error instead of your business.",
        whySpoken: "Anyone who taps that link gets an error instead of your business.",
        subject: `${possessive(biz)} website didn't load`,
        problems: [],
        basedOn: "Website on the listing didn't load when checked",
        verb: "build",
      };
    case "parked":
      return {
        kind: "parked",
        opening: `I looked up ${biz} on Google. The website address on the listing${domain ? `, ${domain},` : ""} shows a parked page instead of your business.`,
        short: "The website address on your Google listing shows a parked page.",
        spoken: "I noticed the website address on your Google listing shows a parked page.",
        why: "Anyone who taps that link lands on a page that has nothing to do with you.",
        whySpoken: "Anyone who taps that link lands on a page that has nothing to do with you.",
        subject: `${possessive(biz)} website address shows a parked page`,
        problems: [],
        basedOn: "Website address shows a parked page",
        verb: "build",
      };
    case "ok": {
      const breakdown = lead.score_breakdown as Partial<ScoreBreakdown> | null;
      if (lead.score_total === null || !breakdown?.deductions) return unchecked;
      const problems = siteProblems(breakdown);
      const site = domain ? ` (${domain})` : "";
      if (problems.length === 0 || healthBand(lead.score_total) === "good") {
        return {
          kind: "good",
          opening: `I looked at ${possessive(biz)} website${site}. It's in good shape: it scored ${lead.score_total} out of 100 on my checks. I'm not writing to sell you a new one.`,
          short: "Your website is in good shape. The part I'd look at is how fast quote requests and missed calls get an answer.",
          spoken: "I looked at your website, and it's in good shape, so this isn't about a new site.",
          why: "",
          whySpoken: "",
          subject: `Quote requests and missed calls at ${biz}`,
          problems: [],
          basedOn: `Site score ${lead.score_total}/100, a good site, so the drafts pitch follow-up automation`,
          verb: "change",
        };
      }
      return {
        kind: "site",
        opening: `I ran ${possessive(biz)} homepage${site} through a few checks. ${problems.length === 1 ? "One thing stood out:" : "A few things stood out:"}`,
        short: problems[0],
        spoken: `I looked at your website. ${problems[0]}`,
        why:
          problems.length === 1
            ? "That's a reason someone on a phone might call the next listing instead."
            : "Each of those is a reason someone on a phone might call the next listing instead.",
        whySpoken: "That's a reason someone on a phone might call the next listing instead.",
        subject: problems.length === 1 ? `Something I noticed on ${possessive(biz)} website` : `A few things I noticed on ${possessive(biz)} website`,
        problems,
        basedOn: `Site score ${lead.score_total}/100`,
        verb: "fix",
      };
    }
    default:
      return unchecked;
  }
}

function reviewsSentence(lead: DraftLead, noSite: boolean): string {
  const n = lead.review_count;
  const stars = lead.rating !== null ? ` at ${lead.rating} stars` : "";
  if (n === 0) return "The listing has no reviews yet.";
  if (n < 15) return `The listing has ${n} review${n === 1 ? "" : "s"}${stars}, so it doesn't say much on its own.`;
  const found = lead.rating !== null && lead.rating >= 4.5 ? "people already find you and rate you well" : "people already find you";
  return `You have ${n} reviews${stars}, so ${found}. ${noSite ? "A website is the missing piece." : "The site should back that up."}`;
}

function automationReviewsSentence(lead: DraftLead): string {
  const n = lead.review_count;
  if (n === 0) return "You don't have any Google reviews yet. Asking after every job is the simplest way I know to change that.";
  if (n < 15) return `You have ${n} Google review${n === 1 ? "" : "s"}. Asking after every job is the simplest way I know to build that up.`;
  return `You already have ${n} Google reviews. Asking after every job keeps them coming.`;
}

function emailParts(config: OutreachConfig, senderName: string, phone: string) {
  return {
    signature: [senderName, BUSINESS_NAME, phone, BUSINESS_SITE].join("\n"),
    footer: `${OPT_OUT_LINE}\n${BUSINESS_NAME}, ${config.mailingAddress}`,
  };
}

/** The full email text as it should be sent: body, signature, then the opt-out footer. */
export function composeEmail(draft: Pick<EmailDraft, "body" | "signature" | "footer">): string {
  return [draft.body.trim(), draft.signature, draft.footer].join("\n\n");
}

/**
 * Checks an email (possibly edited by hand) before it's copied or opened in a
 * mail app. Returns what's missing, or null if it's fine to send.
 */
export function emailComplianceProblem(text: string, mailingAddress: string): string | null {
  const missing = [];
  if (!text.includes(BUSINESS_NAME)) missing.push(`the business name (${BUSINESS_NAME})`);
  if (!text.includes(OPT_OUT_LINE)) missing.push(`the opt-out line ("${OPT_OUT_LINE}")`);
  if (!text.includes(mailingAddress)) missing.push("the mailing address");
  return missing.length ? `Put back ${missing.join(" and ")} before sending.` : null;
}

export function buildDrafts(lead: DraftLead, config: OutreachConfig): Drafts {
  const f = findingFor(lead);
  const biz = lead.business_name;
  const name = config.senderName ?? "[your name]";
  const phone = config.callbackPhone ?? "[your callback number]";
  const trades = tradePlural(lead.trade);
  const where = area(lead);
  const noSite = f.kind === "none" || f.kind === "social" || f.kind === "dead" || f.kind === "parked";

  const warnings: string[] = [];
  if (!config.senderName) warnings.push("OUTREACH_SENDER_NAME is not set, so the drafts say [your name].");
  if (!config.callbackPhone) warnings.push("OUTREACH_CALLBACK_PHONE is not set, so the drafts say [your callback number].");
  if (f.kind === "unchecked") {
    warnings.push(
      lead.site_status === "blocked"
        ? "This lead's site blocked the automatic check, so the drafts don't name a specific problem. Look at the site yourself first."
        : "This lead's website hasn't been checked yet, so the drafts don't name a specific problem. Score it from the dashboard first.",
    );
  }

  const facts = [f.basedOn, `${lead.review_count} Google review${lead.review_count === 1 ? "" : "s"}${lead.rating !== null ? `, ${lead.rating} stars` : ""}`];
  if (lead.trade) facts.push(`${lead.trade} ${where}`);

  if (f.kind === "good") return automationDrafts(lead, f, config, facts, warnings);

  const call = [
    `Hi, is this ${biz}?`,
    `[If yes] This is ${name} with ${BUSINESS_NAME}. Am I speaking with the owner?`,
    `[If yes] I'll keep this short. I build websites for ${trades} ${where}. ${[f.spoken, f.whySpoken].filter(Boolean).join(" ")}`,
    `It's $97 a month for a hand-coded site, with setup, hosting and maintenance included, and it's live within 48 hours. Would a short call this week be worth it, so I can show you what I'd ${f.verb}?`,
    "[If not now] That's fine. Can I email you what I found?",
    "[If not the owner] Who's the best person to talk to about the website, and when should I call back?",
  ].join("\n\n");

  const voicemail = [
    `Hi, this is ${name} with ${BUSINESS_NAME}, calling for ${biz}.`,
    f.spoken,
    `I build websites for ${trades} ${where}, and I can show you what I'd ${f.verb}.`,
    `Call me back at ${phone}. Again, that's ${name} at ${phone}.`,
  ].join(" ");

  if (!config.mailingAddress) {
    return { basedOn: facts, call, voicemail, email: { blocked: MISSING_ADDRESS_MESSAGE }, followUp: { blocked: MISSING_ADDRESS_MESSAGE }, warnings };
  }

  const { signature, footer } = emailParts(config, name, phone);
  const opening = f.problems.length ? `${f.opening}\n\n${f.problems.map((p) => `- ${p}`).join("\n")}` : f.opening;
  const cta =
    f.verb === "build"
      ? `If it's useful, reply and I'll show you what I'd build for ${biz}.`
      : f.verb === "fix"
        ? "If it's useful, reply and I'll show you what I'd fix first."
        : "If that's ever useful, reply and I'll show you what I'd do.";

  const email: EmailDraft = {
    subject: f.subject,
    body: [
      "Hello,",
      opening,
      [f.why, reviewsSentence(lead, noSite)].filter(Boolean).join(" "),
      `I'm ${name}. I build hand-coded websites for ${trades} ${where}. ${PRICE_LINE}`,
      cta,
    ].join("\n\n"),
    signature,
    footer,
  };

  const followUp: EmailDraft = {
    subject: `Following up: ${f.subject}`,
    body: [
      "Hello,",
      [`Following up on my note about ${biz}.`, f.short].filter(Boolean).join(" "),
      `If now isn't the time, that's fine. If you want to see what I'd ${f.verb}, reply and I'll walk you through it. It's $97 a month and live within 48 hours.`,
    ].join("\n\n"),
    signature,
    footer,
  };

  return { basedOn: facts, call, voicemail, email, followUp, warnings };
}

/** Drafts for a lead whose website is already good: pitch follow-up automation, not a site. */
function automationDrafts(lead: DraftLead, f: Finding, config: OutreachConfig, facts: string[], warnings: string[]): Drafts {
  const biz = lead.business_name;
  const name = config.senderName ?? "[your name]";
  const phone = config.callbackPhone ?? "[your callback number]";
  const trades = tradePlural(lead.trade);

  const call = [
    `Hi, is this ${biz}?`,
    `[If yes] This is ${name} with ${BUSINESS_NAME}. Am I speaking with the owner?`,
    `[If yes] I'll keep this short. ${f.spoken} I set up follow-up automation for ${trades} ${area(lead)}. When someone fills out your quote form, they get a reply right away that asks about the job, so they aren't waiting days to hear back. Missed calls get a text back, and finished jobs get a review request.`,
    "Would a short call this week be worth it, so I can show you how it would work?",
    "[If not now] That's fine. Can I email you the details?",
    "[If not the owner] Who handles quote requests and calls, and when should I call back?",
  ].join("\n\n");

  const voicemail = [
    `Hi, this is ${name} with ${BUSINESS_NAME}, calling for ${biz}.`,
    f.spoken,
    `I set up follow-up automation for ${trades}: quote requests get a reply right away, missed calls get a text back, and finished jobs get a review request.`,
    `If you want to see how it would work, call me back at ${phone}. Again, that's ${name} at ${phone}.`,
  ].join(" ");

  if (!config.mailingAddress) {
    return { basedOn: facts, call, voicemail, email: { blocked: MISSING_ADDRESS_MESSAGE }, followUp: { blocked: MISSING_ADDRESS_MESSAGE }, warnings };
  }

  const { signature, footer } = emailParts(config, name, phone);
  const email: EmailDraft = {
    subject: f.subject,
    body: [
      "Hello,",
      f.opening,
      `What I'd look at is what happens after someone reaches out. If a quote request sits for a day or a call goes to voicemail, some of those people call the next listing instead. I set up follow-up automation for ${trades} that covers that:`,
      AUTOMATION.map((a) => `- ${a}`).join("\n"),
      automationReviewsSentence(lead),
      `I'm ${name}. If it's useful, reply and I'll show you how it would work for ${biz}.`,
    ].join("\n\n"),
    signature,
    footer,
  };

  const followUp: EmailDraft = {
    subject: `Following up: ${f.subject}`,
    body: [
      "Hello,",
      `Following up on my note about ${biz}. ${f.short}`,
      "If now isn't the time, that's fine. If you want to see how the follow-up automation would work, reply and I'll walk you through it.",
    ].join("\n\n"),
    signature,
    footer,
  };

  return { basedOn: facts, call, voicemail, email, followUp, warnings };
}

/**
 * The only lead facts sent to the AI rewrite: what's on the public Google
 * listing and what our website check found. No phone, address, notes or
 * outreach history.
 */
export function draftFacts(lead: DraftLead) {
  const f = findingFor(lead);
  return {
    business_name: lead.business_name,
    trade: lead.trade,
    town: lead.city,
    state: lead.state,
    google_review_count: lead.review_count,
    google_rating: lead.rating,
    website_finding: f.basedOn,
    website_problems: f.problems,
    pitch: f.kind === "good" ? "follow-up automation (the website is already good)" : "website",
  };
}
