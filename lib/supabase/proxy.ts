import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import { getSupabaseConfig } from "./config";

// Paths reachable without a session. Everything else requires the owner.
const PUBLIC_PATHS = ["/login", "/auth/callback"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session cookie and gates every request:
 * - no session: pages redirect to /login, API routes get 401 JSON
 * - session for an email other than ALLOWED_EMAIL: signed out and blocked
 * - owner on /login: sent to the dashboard
 *
 * This is the first gate, not the only one. RLS in the database is what
 * actually protects the data.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseConfig();

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Keep getClaims() directly after creating the client: it verifies the JWT
  // and refreshes an expiring session.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (claims && !isAllowedEmail(claims.email)) {
    await supabase.auth.signOut();
    if (isApi) return carryCookies(response, jsonError(403, "Forbidden"));
    return carryCookies(response, redirectTo(request, "/login?error=not_allowed"));
  }

  if (!claims && !isPublicPath(pathname)) {
    if (isApi) return carryCookies(response, jsonError(401, "Not signed in"));
    const next = encodeURIComponent(pathname + search);
    return carryCookies(response, redirectTo(request, `/login?next=${next}`));
  }

  if (claims && pathname === "/login") {
    return carryCookies(response, redirectTo(request, "/dashboard"));
  }

  return response;
}

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

// A new response loses the refreshed auth cookies and no-cache headers unless
// they are copied over.
function carryCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) to.headers.set(header, value);
  }
  return to;
}
