import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { MobileNav } from "@/components/MobileNav";
import { QuickSearch } from "@/components/QuickSearch";
import { ScoringProvider, ScoringStatus } from "@/components/ScoringProvider";
import { SidebarContent } from "@/components/Sidebar";
import { requireOwner } from "@/lib/session";
import { signOut } from "./actions";

const CONTENT_ID = "app-content";

// Shell for every signed-in page: navy sidebar on desktop, a drawer on
// phones, and a top bar with quick search and scoring progress. The proxy
// already blocks signed-out requests; requireOwner() is a second check.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const owner = await requireOwner();

  return (
    <ScoringProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to content
      </a>

      <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh lg:block">
          <SidebarContent email={owner.email} signOutAction={signOut} />
        </aside>

        <div id={CONTENT_ID} className="flex min-w-0 flex-col">
          {/* Sticky on desktop; on a phone it scrolls away to leave room for the call list. */}
          <header className="z-20 border-b border-line bg-surface lg:sticky lg:top-0">
            <div className="flex min-h-14 items-center gap-2 px-3 sm:px-6">
              <MobileNav email={owner.email} signOutAction={signOut} contentId={CONTENT_ID} />
              <Link
                href="/dashboard"
                className="mr-1 inline-flex min-h-11 shrink-0 items-center lg:hidden"
                aria-label="JT Builds Co Lead Engine, dashboard"
              >
                <BrandMark height={22} variant="dark" />
              </Link>
              <div className="flex flex-1 justify-end sm:justify-start">
                <QuickSearch />
              </div>
            </div>
            <ScoringStatus />
          </header>

          <main id="main" tabIndex={-1} className="w-full max-w-7xl flex-1 px-3 py-6 focus:outline-none sm:px-6 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </ScoringProvider>
  );
}
