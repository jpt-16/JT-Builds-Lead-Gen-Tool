"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { DashboardIcon, ListIcon, PinIcon, SignOutIcon } from "@/components/Icons";

// Pages are added here as each phase ships them.
const LINKS = [
  { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { href: "/leads", label: "Leads", Icon: ListIcon },
  { href: "/find", label: "Find leads", Icon: PinIcon },
];

/**
 * Sidebar contents, shared by the desktop sidebar and the phone drawer.
 * signOutAction is the server action from the app layout.
 */
export function SidebarContent({
  email,
  signOutAction,
  onNavigate,
}: {
  email: string;
  signOutAction: () => Promise<void>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-nav text-nav-ink">
      <Link href="/dashboard" onClick={onNavigate} className="flex min-h-16 items-center gap-3 px-5 hover:opacity-80">
        <BrandMark height={26} />
        <span className="text-[11px] font-semibold tracking-[0.18em] text-nav-muted uppercase">Lead Engine</span>
      </Link>

      <nav aria-label="Main" className="mt-2 flex-1 px-3">
        <ul className="space-y-1">
          {LINKS.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
                    active ? "bg-white/10 text-white" : "text-nav-ink hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-nav-active" aria-hidden="true" />}
                  <Icon className={`size-5 ${active ? "text-nav-active" : "text-nav-muted"}`} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="truncate text-xs text-nav-muted" title={email}>
          {email}
        </p>
        <Link
          href="/reset-password"
          onClick={onNavigate}
          className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-nav-ink hover:text-white"
        >
          Change password
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-nav-ink hover:text-white">
            <SignOutIcon className="size-4" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
