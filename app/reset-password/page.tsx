import type { Metadata } from "next";
import { BrandMark } from "@/components/BrandMark";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "New password | JT Builds Co Lead Engine" };

// Needs a session, so the proxy sends signed-out visitors to /login. A reset
// email link signs the owner in first, then lands here.
export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <BrandMark height={38} variant="dark" />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight text-ink">Lead Engine</h1>
      <p className="mt-1 text-sm text-muted">Set a new password for your account.</p>
      <div className="card mt-6">
        <NewPasswordForm />
      </div>
    </main>
  );
}
