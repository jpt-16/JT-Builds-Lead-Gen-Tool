import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 renamed middleware.ts to proxy.ts. Same job: runs before every
// matched request. Here it refreshes the session and blocks non-owners.
export async function proxy(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (error) {
    // Most likely missing Supabase env vars. Log the message only; never echo
    // config values to the client.
    console.error("proxy: session check failed:", error instanceof Error ? error.message : error);
    return new Response("Server is not configured correctly.", { status: 500 });
  }
}

export const config = {
  matcher: [
    // Everything except static assets and image optimization.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
