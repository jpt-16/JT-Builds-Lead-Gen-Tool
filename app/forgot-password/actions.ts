"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { isAllowedEmail } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ResetRequestState = { error?: string; message?: string };

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

// Same answer whether or not the email is the owner's, so the form never
// reveals which address is allowed.
const SENT = "If that is the owner's email, a reset link is on its way. It can take a minute. Check spam too.";

/** Emails a password reset link that returns to this app and opens the set-new-password page. */
export async function requestPasswordReset(_prev: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email." };
  if (!isAllowedEmail(parsed.data)) return { message: SENT };

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? `https://${requestHeaders.get("host")}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });

  if (error) {
    if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
      return {
        error: "Too many reset emails were sent. Supabase's built-in email service allows only a few an hour. Wait an hour and try once more.",
      };
    }
    console.error("password reset:", error.code ?? error.message);
    return { error: "Could not send the reset email. Try again in a minute." };
  }
  return { message: SENT };
}
