import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Landing point for the email confirmation link. Exchanges the one-time code
// for a session, then sends me on to the app.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback", origin));
}
