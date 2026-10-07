import type { Metadata } from "next";
import { safeRedirectPath } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in | JT Builds Co Lead Engine" };

const NOTICES: Record<string, string> = {
  not_allowed: "That account is not allowed to use this app.",
  auth_callback: "That link did not work. Try signing in, or create the account again for a new link.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : undefined);
  const notice = typeof params.error === "string" ? NOTICES[params.error] : undefined;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">JT Builds Co Lead Engine</h1>
      <p className="mt-1 text-sm text-slate-600">Private. Owner access only.</p>
      <div className="card mt-6">
        <LoginForm next={next} notice={notice} />
      </div>
    </main>
  );
}
