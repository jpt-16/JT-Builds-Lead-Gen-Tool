"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Pages are added here as each phase ships them.
const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/find", label: "Find leads" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main">
      <ul className="flex gap-5">
        {LINKS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center text-xs font-medium tracking-[0.2em] uppercase transition-colors ${
                  active ? "text-accent-500" : "text-neutral-200 hover:text-accent-500"
                }`}
              >
                <span className={active ? "border-b border-accent-500 pb-0.5" : undefined}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
