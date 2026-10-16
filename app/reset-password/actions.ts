"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type NewPasswordState = { error?: string };

const schema = z
  .object({
    password: z.string().min(12, "Use at least 12 characters.").max(256, "That password is too long."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The two passwords don't match." });

/** Sets a new password for the signed-in owner (via a reset link, or from the sidebar). */
export async function setNewPassword(_prev: NewPasswordState, formData: FormData): Promise<NewPasswordState> {
  const parsed = schema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a new password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { error: "Choose a password you haven't used for this account." };
    if (error.code === "weak_password") return { error: "Supabase rejected that password as too weak. Try a longer one." };
    if (error.code === "reauthentication_needed")
      return { error: "For security, request a fresh reset link from the sign-in page and use it within a few minutes." };
    console.error("set password:", error.code ?? error.message);
    return { error: "Could not change the password. Try again, or request a new reset link." };
  }
  redirect("/dashboard?password=changed");
}
