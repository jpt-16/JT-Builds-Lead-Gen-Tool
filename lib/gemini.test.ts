import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanRewrite, rewriteDraft, RewriteError } from "./gemini";

afterEach(() => vi.unstubAllGlobals());

const config = { apiKey: "test-key-123", model: "gemini-3.8-flash" };
const facts = {
  business_name: "Alpha Lawn",
  trade: "landscaper",
  town: "Mansfield",
  state: "MA",
  google_review_count: 6,
  google_rating: 4.2,
  website_finding: "No website on the Google listing",
  website_problems: [],
  pitch: "website",
};

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const reply = (json: unknown) => ({ candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: JSON.stringify(json) }] } }] });

describe("rewriteDraft", () => {
  it("sends the key in a header, the facts and template in the prompt, and reads the JSON reply", async () => {
    const fetchMock = mockFetch(200, reply({ subject: "Alpha Lawn's listing", text: "Hello,\n\nYour listing has no website!" }));
    const result = await rewriteDraft(config, { kind: "email", facts, subject: "No website", text: "Hello,\n\nTemplate body." });

    expect(result).toEqual({ subject: "Alpha Lawn's listing", text: "Hello,\n\nYour listing has no website." });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect(url).not.toContain("test-key-123");
    expect(init.headers["x-goog-api-key"]).toBe("test-key-123");
    const body = JSON.parse(init.body);
    const prompt = body.contents[0].parts[0].text;
    expect(prompt).toContain("Template body.");
    expect(prompt).toContain('"business_name": "Alpha Lawn"');
    expect(body.systemInstruction.parts[0].text).toContain("no exclamation marks");
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
  });

  it("leaves out the thinking level for older models", async () => {
    const fetchMock = mockFetch(200, reply({ text: "Hi, this is Sam." }));
    await rewriteDraft({ ...config, model: "gemini-2.5-flash" }, { kind: "voicemail", facts, text: "Template." });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).generationConfig.thinkingConfig).toBeUndefined();
  });

  it("turns API errors into messages without the key", async () => {
    mockFetch(400, { error: { message: "API key not valid. Please pass a valid API key." } });
    const error = await rewriteDraft(config, { kind: "call", facts, text: "x" }).catch((e) => e);
    expect(error).toBeInstanceOf(RewriteError);
    expect(error.message).toContain("GEMINI_API_KEY");
    expect(error.message).not.toContain("test-key-123");

    mockFetch(404, { error: { message: "models/nope is not found" } });
    await expect(rewriteDraft({ ...config, model: "nope" }, { kind: "call", facts, text: "x" })).rejects.toThrow("GEMINI_MODEL");
    mockFetch(429, {});
    await expect(rewriteDraft(config, { kind: "call", facts, text: "x" })).rejects.toThrow("rate limit");
  });

  it("rejects a reply that isn't the expected JSON", async () => {
    mockFetch(200, { candidates: [{ content: { parts: [{ text: "not json" }] } }] });
    await expect(rewriteDraft(config, { kind: "call", facts, text: "x" })).rejects.toThrow("expected format");
    mockFetch(200, { promptFeedback: { blockReason: "SAFETY" } });
    await expect(rewriteDraft(config, { kind: "call", facts, text: "x" })).rejects.toThrow("declined");
  });
});

describe("cleanRewrite", () => {
  it("drops exclamation marks and any opt-out line the model added to an email", () => {
    expect(cleanRewrite("Hello,\n\nGreat site!\n\nReply STOP to opt out.", "email")).toBe("Hello,\n\nGreat site.");
    expect(cleanRewrite("Call me back!", "voicemail")).toBe("Call me back.");
  });
});
