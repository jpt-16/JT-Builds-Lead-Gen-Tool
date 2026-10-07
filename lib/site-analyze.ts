import * as cheerio from "cheerio";

// Homepage checks for the built-in scorer. Pure functions over HTML so they
// can be tested without the network. Only the homepage is checked, as served
// (no JavaScript is run), so a feature that only appears after scripts run
// can be missed. Messages say "on the homepage" for that reason.

export type HomepageChecks = {
  https: boolean;
  viewport: boolean;
  title: boolean;
  metaDescription: boolean;
  h1Count: number;
  visiblePhone: boolean;
  clickToCall: boolean;
  contactOrBooking: boolean;
  localBusinessSchema: boolean;
  builders: string[];
};

const PHONE_PATTERN = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

const BOOKING_HOSTS =
  /calendly\.com|acuityscheduling\.com|squareup\.com\/appointments|square\.site|housecallpro\.com|getjobber\.com|setmore\.com|schedulicity\.com|vagaro\.com|booksy\.com|servicetitan\.com|workiz\.com|fresha\.com|tidycal\.com|youcanbook\.me|zcal\.co/i;
const FORM_EMBED_HOSTS = /jotform|typeform|wufoo|formstack|hsforms|hubspot\.com\/forms|docs\.google\.com\/forms|forms\.gle|cognitoforms|123formbuilder/i;
const BOOKING_TEXT =
  /\b(book( now| online| (a|an|your) (appointment|service|estimate|consultation))?|schedule( now| online| (a|an|your) (service|appointment|estimate|visit|consultation))?|request (a |an )?(free )?(quote|estimate|service|appointment|consultation)|get (a |an |your )?(free )?(quote|estimate|consultation)|contact us|free (quote|estimate|consultation))\b/i;
// A link to a page that is clearly for getting in touch also counts.
const CONTACT_PATH = /^(?:https?:\/\/[^/]+)?\/(contact|contact-us|get-a-quote|quote|free-estimate|estimate|book|booking|schedule|appointments?|request-service)(?:[/?#.]|$)/i;

// LocalBusiness and the subtypes a local trade business is likely to use.
const LOCAL_BUSINESS_TYPES = new Set(
  [
    "LocalBusiness",
    "HomeAndConstructionBusiness",
    "GeneralContractor",
    "Electrician",
    "Plumber",
    "HVACBusiness",
    "RoofingContractor",
    "HousePainter",
    "Locksmith",
    "MovingCompany",
    "AutomotiveBusiness",
    "AutoRepair",
    "AutoWash",
    "ProfessionalService",
    "LandscapingBusiness",
    "CleaningService",
    "EmergencyService",
  ].map((t) => t.toLowerCase()),
);

export function analyzeHomepage(html: string, finalUrl: string): HomepageChecks {
  const $ = cheerio.load(html);
  const lowerHtml = html.toLowerCase();

  const viewport = $('meta[name="viewport" i]').attr("content") ?? "";
  const telLinks = $('a[href^="tel:" i]').length;

  return {
    https: finalUrl.startsWith("https://"),
    viewport: /width\s*=\s*device-width/i.test(viewport),
    title: $("title").first().text().trim().length > 0,
    metaDescription: ($('meta[name="description" i]').attr("content") ?? "").trim().length > 0,
    h1Count: $("h1").length,
    visiblePhone: PHONE_PATTERN.test(visibleText($)),
    clickToCall: telLinks > 0,
    contactOrBooking: hasContactOrBooking($, lowerHtml),
    localBusinessSchema: hasLocalBusinessSchema($),
    builders: detectBuilders($, lowerHtml),
  };
}

function visibleText($: cheerio.CheerioAPI): string {
  const body = $("body").clone();
  body.find("script, style, noscript, template, svg").remove();
  return body.text().replace(/\s+/g, " ");
}

function hasContactOrBooking($: cheerio.CheerioAPI, lowerHtml: string): boolean {
  const contactForm = $("form")
    .toArray()
    .some((form) => {
      const f = $(form);
      if (f.attr("role") === "search" || f.find('input[type="search"]').length) return false;
      return f.find('textarea, input[type="email"], input[type="tel"], input[name*="email" i], input[name*="phone" i]').length > 0;
    });
  if (contactForm) return true;

  // Builder forms and embeds that do not render a plain <form> server-side.
  if (/sqs-block-form|form-block|wixui-form|data-hook="form/i.test(lowerHtml)) return true;
  const embeds = $("iframe[src], script[src]")
    .toArray()
    .map((el) => $(el).attr("src") ?? "");
  if (embeds.some((src) => FORM_EMBED_HOSTS.test(src) || BOOKING_HOSTS.test(src))) return true;

  return $("a[href]")
    .toArray()
    .some((a) => {
      const link = $(a);
      const href = link.attr("href") ?? "";
      return BOOKING_HOSTS.test(href) || CONTACT_PATH.test(href) || BOOKING_TEXT.test(link.text().trim());
    });
}

function hasLocalBusinessSchema($: cheerio.CheerioAPI): boolean {
  const types: string[] = [];
  const collect = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(collect);
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    if (typeof t === "string") types.push(t);
    if (Array.isArray(t)) types.push(...t.filter((x): x is string => typeof x === "string"));
    if (obj["@graph"]) collect(obj["@graph"]);
  };

  $('script[type="application/ld+json" i]').each((_, el) => {
    try {
      collect(JSON.parse($(el).text()));
    } catch {
      // Malformed JSON-LD counts as missing.
    }
  });
  $("[itemtype]").each((_, el) => {
    const itemtype = $(el).attr("itemtype") ?? "";
    types.push(itemtype.split("/").pop() ?? "");
  });

  return types.some((t) => LOCAL_BUSINESS_TYPES.has(t.replace(/^schema:/i, "").toLowerCase()));
}

function detectBuilders($: cheerio.CheerioAPI, lowerHtml: string): string[] {
  const generator = ($('meta[name="generator" i]').attr("content") ?? "").toLowerCase();
  const found: string[] = [];
  if (generator.includes("wix") || lowerHtml.includes("static.wixstatic.com") || lowerHtml.includes("wix-bolt")) found.push("Wix");
  if (generator.includes("squarespace") || lowerHtml.includes("static1.squarespace.com") || lowerHtml.includes("this is squarespace")) {
    found.push("Squarespace");
  }
  if (generator.includes("go daddy") || generator.includes("godaddy") || lowerHtml.includes("img1.wsimg.com")) found.push("GoDaddy");
  if (generator.includes("weebly") || lowerHtml.includes("editmysite.com") || lowerHtml.includes("weebly.com")) found.push("Weebly");
  return found;
}

const MARKETPLACE_HOSTS =
  /(^|\.)(sedo\.com|afternic\.com|dan\.com|hugedomains\.com|godaddy\.com|domainmarket\.com|undeveloped\.com|bodis\.com|parkingcrew\.net|above\.com|uniregistry\.com|squadhelp\.com|atom\.com|brandbucket\.com|namecheap\.com|domainnamesales\.com|buydomains\.com)$/i;
const PARKED_TEXT =
  /this domain (name )?(is|may be) (for sale|parked|available)|buy this domain|domain (name )?(is )?for sale|make an offer on this domain|parked free|courtesy of godaddy|sedoparking|parkingcrew|bodis\.com|domain parking/i;
const PLACEHOLDER_TEXT = /under construction|coming soon|launching soon|future home of|site is being built|check back soon/i;
const DEFAULT_PAGE_TEXT =
  /welcome to nginx|apache2 (ubuntu|debian) default page|it works!|index of \/|default web site page|this is the default (web )?page|hostinger.*(parked|default)|site not found|web hosting by/i;

/**
 * Reason the site counts as a parked domain or placeholder (no real website),
 * or null if it looks like a real site.
 */
export function detectPlaceholder(html: string, finalUrl: string, requestedUrl: string): string | null {
  const finalHost = new URL(finalUrl).hostname.toLowerCase();
  const requestedHost = new URL(requestedUrl).hostname.toLowerCase().replace(/^www\./, "");
  if (!finalHost.endsWith(requestedHost) && MARKETPLACE_HOSTS.test(finalHost)) {
    return "Domain redirects to a domain marketplace.";
  }

  const $ = cheerio.load(html);
  const text = visibleText($);
  const words = text.split(" ").filter(Boolean).length;
  const title = $("title").first().text();

  if (PARKED_TEXT.test(text) || PARKED_TEXT.test(title)) return "Domain is parked or for sale.";
  if (DEFAULT_PAGE_TEXT.test(`${title} ${text.slice(0, 500)}`) && words < 300) return "Shows a default hosting page, not a site.";
  if (PLACEHOLDER_TEXT.test(`${title} ${text}`) && words < 200) return "Only a placeholder (\"coming soon\" or \"under construction\").";
  // Truly blank: almost no text, nothing to click, no form. A near-empty page
  // that loads scripts is probably rendered by JavaScript, so it is left alone.
  const blank = words < 8 && $("a[href]").length < 2 && $("img, form").length === 0 && $("script[src]").length === 0;
  if (blank) {
    return "Page is essentially empty.";
  }
  return null;
}
