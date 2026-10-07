import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { BrandMark } from "@/components/BrandMark";
import { ScoringProvider, ScoringStatus } from "@/components/ScoringProvider";
import { requireOwner } from "@/lib/session";
import { signOut } from "./actions";

// Shell for every signed-in page. The proxy already blocks signed-out
// requests; requireOwner() is a second check and gives us the email.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const owner = await requireOwner();

  return (
    <ScoringProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-sm focus:border focus:border-accent-500 focus:bg-surface focus:px-4 focus:py-3 focus:text-xs focus:tracking-[0.18em] focus:uppercase"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-10 bg-bg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-1 px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-1">
            <Link href="/dashboard" className="inline-flex min-h-11 items-center transition-opacity hover:opacity-70">
              <BrandMark height={30} />
              <span className="ml-3 hidden text-xs tracking-[0.2em] text-muted uppercase sm:inline">Lead Engine</span>
            </Link>
            <AppNav />
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted md:inline">{owner.email}</span>
            <form action={signOut}>
              <button type="submit" className="btn-secondary">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <ScoringStatus />
        <div className="rule-fade" aria-hidden="true" />
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-8 focus:outline-none">
        {children}
      </main>
    </ScoringProvider>
  );
}
