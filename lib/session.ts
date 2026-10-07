import "server-only";
import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type Owner = { id: string; email: string };

/** The signed-in owner, or null if signed out or not the allowed email. */
export async function getOwner(): Promise<Owner | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || !claims.email || !isAllowedEmail(claims.email)) return null;
  return { id: claims.sub, email: claims.email };
}

/** Use at the top of protected pages and actions. Redirects to /login if not the owner. */
export async function requireOwner(): Promise<Owner> {
  const owner = await getOwner();
  if (!owner) redirect("/login");
  return owner;
}
