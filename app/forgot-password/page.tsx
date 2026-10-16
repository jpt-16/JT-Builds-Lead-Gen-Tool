import type { Metadata } from "next";
import { BrandMark } from "@/components/BrandMark";
import { ResetRequestForm } from "./reset-request-form";

export const metadata: Metadata = { title: "Reset password | JT Builds Co Lead Engine" };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <BrandMark height={38} variant="dark" />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight text-ink">Lead Engine</h1>
      <p className="mt-1 text-sm text-muted">Private. Owner access only.</p>
      <div className="card mt-6">
        <ResetRequestForm />
      </div>
    </main>
  );
}
