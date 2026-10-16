import Link from "next/link";
import { ChevronRightIcon } from "@/components/Icons";

type Crumb = { label: string; href?: string };

/** Breadcrumbs, page title, optional description and actions on the right. */
export function PageHeader({
  crumbs,
  title,
  description,
  actions,
}: {
  crumbs: Crumb[];
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="-mt-2.5 -mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-muted">
            {crumbs.map((crumb, i) => (
              <li key={crumb.label} className="flex items-center gap-1">
                {i > 0 && <ChevronRightIcon className="size-3.5" />}
                {crumb.href ? (
                  <Link href={crumb.href} className="inline-flex min-h-11 min-w-11 items-center hover:text-accent hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
