"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAllowedEmail, safeRedirectPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = { error?: string; message?: string };

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(256),
});

const signUpSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(12, "Use at least 12 characters.").max(256),
});

const INVALID_LOGIN = "Invalid email or password.";

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email and password." };

  // Same message as a wrong password, so the form does not reveal the allowed email.
  if (!isAllowedEmail(parsed.data.email)) return { error: INVALID_LOGIN };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirm your email first. Check your inbox for the link." };
    }
    if (error.code === "over_request_rate_limit") {
      return { error: "Too many attempts. Wait a minute and try again." };
    }
    return { error: INVALID_LOGIN };
  }

  redirect(safeRedirectPath(formData.get("next")));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const passwordIssue = parsed.error.issues.find((i) => i.path[0] === "password");
    return { error: passwordIssue?.message ?? "Enter a valid email." };
  }

  if (!isAllowedEmail(parsed.data.email)) return { error: "Sign-ups are closed." };

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? `https://${requestHeaders.get("host")}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    if (error.code === "user_already_exists") {
      return { error: "That account already exists. Sign in instead." };
    }
    if (error.code === "weak_password") {
      return { error: "Supabase rejected that password as too weak. Try a longer one." };
    }
    // Only the allowed email reaches this point, so a database rejection
    // means the signup lock is not configured to match ALLOWED_EMAIL.
    return {
      error:
        "The database rejected the signup. Check that private.app_config holds the same email as ALLOWED_EMAIL (see supabase/setup/set_allowed_email.sql).",
    };
  }

  if (data.session) redirect("/dashboard");
  return { message: "Account created. Check your email for the confirmation link, then sign in." };
}
