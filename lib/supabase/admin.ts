import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getSupabaseConfig } from "./config";

// Service-role client. It bypasses RLS, so it is only for the scheduled cron
// job, which has no signed-in user. Never import this from pages, actions or
// anything a browser can reach, and never log the key.
export function createAdminClient() {
  const { url } = getSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is not set.");
  return createClient<Database>(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
