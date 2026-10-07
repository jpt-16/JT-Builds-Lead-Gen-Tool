import { AppNav } from "@/components/AppNav";
import { requireOwner } from "@/lib/session";
import { signOut } from "./actions";

// Shell for every signed-in page. The proxy already blocks signed-out
// requests; requireOwner() is a second check and gives us the email.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const owner = await requireOwner();

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-base font-bold tracking-tight">JT Builds Co Lead Engine</span>
            <AppNav />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">{owner.email}</span>
            <form action={signOut}>
              <button type="submit" className="btn-secondary">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6">
        {children}
      </main>
    </>
  );
}
