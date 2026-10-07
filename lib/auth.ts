// Pure auth helpers. No server-only import so the proxy and tests can use them.

/**
 * True only when `email` matches ALLOWED_EMAIL (case-insensitive).
 * Fails closed: if ALLOWED_EMAIL is unset, nobody is allowed.
 */
export function isAllowedEmail(
  email: string | null | undefined,
  allowed: string | undefined = process.env.ALLOWED_EMAIL,
): boolean {
  const want = allowed?.trim().toLowerCase();
  const got = email?.trim().toLowerCase();
  return Boolean(want && got && want === got);
}

export const DEFAULT_REDIRECT = "/dashboard";

/**
 * Returns `next` if it is a same-site path, otherwise the dashboard.
 * Blocks open redirects such as "//evil.com" or "/\evil.com".
 */
export function safeRedirectPath(next: unknown): string {
  if (typeof next !== "string") return DEFAULT_REDIRECT;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return DEFAULT_REDIRECT;
  }
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/auth/")) {
    return DEFAULT_REDIRECT;
  }
  return next;
}
