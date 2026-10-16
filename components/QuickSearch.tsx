import { SearchIcon } from "@/components/Icons";

/** Top-bar search: jumps to the leads table filtered by name, phone, town or notes. */
export function QuickSearch() {
  return (
    <form action="/leads" method="get" role="search" className="relative w-full max-w-md">
      <label htmlFor="quick-search" className="sr-only">
        Search leads
      </label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
      <input
        id="quick-search"
        name="q"
        type="search"
        placeholder="Search leads by name, phone or town"
        className="min-h-10 w-full rounded-md border border-line-strong bg-surface pr-3 pl-9 text-sm text-ink focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] focus:outline-none"
      />
    </form>
  );
}
