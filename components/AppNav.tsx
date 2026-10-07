"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Pages are added here as each phase ships them.
const LINKS = [{ href: "/dashboard", label: "Dashboard" }];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main">
      <ul className="flex gap-1">
        {LINKS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium ${
                  active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
