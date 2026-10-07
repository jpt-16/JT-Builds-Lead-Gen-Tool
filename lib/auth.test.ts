import { describe, expect, it } from "vitest";
import { DEFAULT_REDIRECT, isAllowedEmail, safeRedirectPath } from "./auth";

describe("isAllowedEmail", () => {
  it("matches the allowed email ignoring case and whitespace", () => {
    expect(isAllowedEmail("Owner@Example.com ", "owner@example.com")).toBe(true);
  });

  it("rejects any other email", () => {
    expect(isAllowedEmail("intruder@example.com", "owner@example.com")).toBe(false);
  });

  it("fails closed when ALLOWED_EMAIL is unset or blank", () => {
    expect(isAllowedEmail("owner@example.com", undefined)).toBe(false);
    expect(isAllowedEmail("owner@example.com", "  ")).toBe(false);
  });

  it("rejects a missing email", () => {
    expect(isAllowedEmail(undefined, "owner@example.com")).toBe(false);
    expect(isAllowedEmail("", "owner@example.com")).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it("keeps same-site paths, including query strings", () => {
    expect(safeRedirectPath("/leads?status=new")).toBe("/leads?status=new");
  });

  it.each([
    ["protocol-relative URL", "//evil.com"],
    ["backslash trick", "/\\evil.com"],
    ["absolute URL", "https://evil.com"],
    ["relative path", "leads"],
    ["login loop", "/login"],
    ["auth route", "/auth/callback"],
    ["non-string", 42],
    ["missing", null],
  ])("falls back to the dashboard for %s", (_label, value) => {
    expect(safeRedirectPath(value)).toBe(DEFAULT_REDIRECT);
  });
});
