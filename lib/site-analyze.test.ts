import { describe, expect, it } from "vitest";
import { computeScore } from "./score-calc";
import { analyzeHomepage, detectPlaceholder } from "./site-analyze";

const goodSite = `<!doctype html><html><head>
  <title>Acme Landscaping | Mansfield MA</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Lawn care and landscaping in Mansfield, MA.">
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":["LocalBusiness","LandscapingBusiness"],"name":"Acme"}]}</script>
</head><body>
  <h1>Landscaping in Mansfield</h1>
  <p>Call us at (508) 555-0100 for a free estimate.</p>
  <a href="tel:+15085550100">Call now</a>
  <form action="/contact"><input name="name"><input type="email" name="email"><textarea name="message"></textarea></form>
</body></html>`;

const weakSite = `<html><head><title></title>
  <meta name="generator" content="Starfield Technologies; Go Daddy Website Builder 8.0">
</head><body>
  <h1>Welcome</h1><h1>Our Services</h1>
  <form role="search"><input type="search" name="q"></form>
  <a href="/about">About us</a>
  <script>var phone = "508-555-0100";</script>
</body></html>`;

describe("analyzeHomepage", () => {
  it("passes every check on a well-built site", () => {
    expect(analyzeHomepage(goodSite, "https://acme.example/")).toEqual({
      https: true,
      viewport: true,
      title: true,
      metaDescription: true,
      h1Count: 1,
      visiblePhone: true,
      clickToCall: true,
      contactOrBooking: true,
      localBusinessSchema: true,
      builders: [],
    });
  });

  it("catches the problems on a weak site and flags the builder", () => {
    const checks = analyzeHomepage(weakSite, "http://weak.example/");
    expect(checks).toMatchObject({
      https: false,
      viewport: false,
      title: false,
      metaDescription: false,
      h1Count: 2,
      visiblePhone: false, // the number only appears inside a script
      clickToCall: false,
      contactOrBooking: false, // a search form is not a contact form
      localBusinessSchema: false,
      builders: ["GoDaddy"],
    });
  });

  it("counts a booking link or embedded form as a way to get in touch", () => {
    const booking = '<body><a href="https://calendly.com/acme/estimate">Pick a time</a></body>';
    const quoteText = '<body><a href="/contact">Get a free quote</a></body>';
    const embed = '<body><iframe src="https://form.jotform.com/123"></iframe></body>';
    const contactPage = '<body><a href="/contact">Start a project</a></body>';
    const consultation = '<body><a href="/hello">Request a free consultation</a></body>';
    for (const html of [booking, quoteText, embed, contactPage, consultation]) {
      expect(analyzeHomepage(html, "https://x.example/").contactOrBooking).toBe(true);
    }
  });

  it("does not count ordinary links as a way to get in touch", () => {
    const html = '<body><a href="/about">About us</a><a href="/services/contactless">Services</a></body>';
    expect(analyzeHomepage(html, "https://x.example/").contactOrBooking).toBe(false);
  });

  it("recognises builder signatures", () => {
    expect(analyzeHomepage('<img src="https://static.wixstatic.com/media/a.jpg">', "https://x.example").builders).toEqual(["Wix"]);
    expect(analyzeHomepage('<link href="https://static1.squarespace.com/x.css">', "https://x.example").builders).toEqual([
      "Squarespace",
    ]);
    expect(analyzeHomepage('<script src="https://editmysite.com/a.js"></script>', "https://x.example").builders).toEqual(["Weebly"]);
  });
});

describe("detectPlaceholder", () => {
  it("spots parked and for-sale domains", () => {
    expect(detectPlaceholder("<body><h1>This domain is for sale!</h1><p>Make an offer.</p></body>", "https://acme.example/", "https://acme.example/")).toBe(
      "Domain is parked or for sale.",
    );
    expect(detectPlaceholder("<body>Buy now</body>", "https://www.hugedomains.com/domain_profile.cfm?d=acme", "https://acme.example/")).toBe(
      "Domain redirects to a domain marketplace.",
    );
  });

  it("spots coming-soon pages and default hosting pages", () => {
    expect(detectPlaceholder("<title>Coming Soon</title><body><p>Our new website is coming soon.</p></body>", "https://a.example/", "https://a.example/")).toMatch(
      /placeholder/,
    );
    expect(detectPlaceholder("<title>Welcome to nginx!</title><body><h1>Welcome to nginx!</h1></body>", "https://a.example/", "https://a.example/")).toMatch(
      /default hosting page/,
    );
  });

  it("does not flag a real site, or a JavaScript-rendered one", () => {
    expect(detectPlaceholder(goodSite, "https://acme.example/", "https://acme.example/")).toBeNull();
    const spa = '<html><body><div id="root"></div><script src="/assets/app.js"></script></body></html>';
    expect(detectPlaceholder(spa, "https://acme.example/", "https://acme.example/")).toBeNull();
  });

  it("flags a truly blank page", () => {
    expect(detectPlaceholder("<html><body><p>Hello</p></body></html>", "https://a.example/", "https://a.example/")).toBe(
      "Page is essentially empty.",
    );
  });
});

describe("computeScore", () => {
  const speed = { performance: 100, lcpMs: 1800, cls: 0.02 };

  it("gives 100 to a fast site that passes every check", () => {
    const result = computeScore(analyzeHomepage(goodSite, "https://acme.example/"), speed);
    expect(result).toMatchObject({ score: 100, earned: 100, possible: 100, deductions: [] });
  });

  it("explains every deduction in plain English, biggest first", () => {
    const result = computeScore(analyzeHomepage(weakSite, "http://weak.example/"), { performance: 35, lcpMs: 6200, cls: 0.3 });
    expect(result.possible).toBe(100);
    expect(result.score).toBe(7); // 7 of 20 speed points, nothing else passes
    expect(result.deductions[0]).toMatchObject({ check: "performance", points: 13, short: "slow on mobile" });
    const messages = result.deductions.map((d) => d.message).join("\n");
    expect(messages).toContain("Main content takes 6.2s to appear on a phone.");
    expect(messages).toContain("No click-to-call link");
    expect(messages).toContain("2 H1 headings. A page should have exactly one.");
    for (const d of result.deductions) expect(d.points).toBeGreaterThan(0);
  });

  it("scales to what was measured when PageSpeed failed", () => {
    const result = computeScore(analyzeHomepage(goodSite, "https://acme.example/"), null);
    expect(result).toMatchObject({ score: 100, possible: 70 });
  });

  it("scores from PageSpeed alone when the homepage blocked us", () => {
    const result = computeScore(null, { performance: 50, lcpMs: null, cls: null });
    expect(result).toMatchObject({ score: 50, earned: 10, possible: 20 });
  });
});
