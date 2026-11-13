import Link from "next/link";
import { CloseIcon, SearchIcon } from "@/components/Icons";
import { PillPopover } from "@/components/Popover";
import { STATES } from "@/lib/find-leads-config";
import { filtersToParams, PHONE_FILTERS, SITE_FILTERS, type LeadFilters as Filters } from "@/lib/lead-query";
import { LEAD_STATUSES, STATUS_LABELS } from "@/lib/leads-config";

// Filter bar for the leads table: a search box and a row of pill dropdowns,
// then removable chips for every active filter. It is one GET form, so a
// filtered view is just a URL.

function ApplyRow() {
  return (
    <div className="mt-3 flex justify-end">
      <button type="submit" className="btn-primary min-h-10">
        Apply
      </button>
    </div>
  );
}

function rangeLabel(name: string, min?: number, max?: number) {
  if (min !== undefined && max !== undefined) return `${name}: ${min}–${max}`;
  if (min !== undefined) return `${name}: ${min}+`;
  if (max !== undefined) return `${name}: up to ${max}`;
  return name;
}

export function LeadFilters({ filters, trades, runLabel }: { filters: Filters; trades: string[]; runLabel?: string | null }) {
  const removeHref = (keys: (keyof Filters)[]) => {
    const overrides = Object.fromEntries(keys.map((k) => [k, undefined]));
    const params = filtersToParams(filters, { ...overrides, page: 1 });
    return `/leads${params.size ? `?${params}` : ""}`;
  };

  const chips: { label: string; href: string }[] = [];
  if (filters.q) chips.push({ label: `Search: ${filters.q}`, href: removeHref(["q"]) });
  if (filters.trade)
    chips.push({
      label: `Trade: ${filters.trade}`,
      href: removeHref(["trade"]),
    });
  if (filters.status)
    chips.push({
      label: `Status: ${STATUS_LABELS[filters.status]}`,
      href: removeHref(["status"]),
    });
  if (filters.city) chips.push({ label: `Town: ${filters.city}`, href: removeHref(["city"]) });
  if (filters.state)
    chips.push({
      label: `State: ${filters.state}`,
      href: removeHref(["state"]),
    });
  if (filters.site)
    chips.push({
      label: SITE_FILTERS[filters.site],
      href: removeHref(["site"]),
    });
  if (filters.scoreMin !== undefined || filters.scoreMax !== undefined) {
    chips.push({
      label: rangeLabel("Site score", filters.scoreMin, filters.scoreMax),
      href: removeHref(["scoreMin", "scoreMax"]),
    });
  }
  if (filters.ratingMin !== undefined || filters.ratingMax !== undefined) {
    chips.push({ label: rangeLabel("Rating", filters.ratingMin, filters.ratingMax), href: removeHref(["ratingMin", "ratingMax"]) });
  }
  if (filters.phone) chips.push({ label: PHONE_FILTERS[filters.phone], href: removeHref(["phone"]) });
  if (filters.run) chips.push({ label: runLabel ? `From search: ${runLabel}` : "From one search", href: removeHref(["run"]) });
  if (filters.reviewsMin !== undefined || filters.reviewsMax !== undefined) {
    chips.push({
      label: rangeLabel("Reviews", filters.reviewsMin, filters.reviewsMax),
      href: removeHref(["reviewsMin", "reviewsMax"]),
    });
  }

  return (
    <form method="get" action="/leads" className="space-y-3" aria-label="Filter leads">
      <input type="hidden" name="sort" value={filters.sort} />
      <input type="hidden" name="dir" value={filters.dir} />
      {filters.run && <input type="hidden" name="run" value={filters.run} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <label htmlFor="leads-q" className="sr-only">
            Search name, phone, town or notes
          </label>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input id="leads-q" name="q" type="search" defaultValue={filters.q} placeholder="Search leads" className="field-input mt-0 pl-9" />
        </div>

        <PillPopover id="f-trade" label={filters.trade ? `Trade: ${filters.trade}` : "Trade"} active={Boolean(filters.trade)}>
          <label className="block w-56">
            <span className="field-label">Trade</span>
            <select name="trade" defaultValue={filters.trade ?? ""} className="field-input">
              <option value="">Any trade</option>
              {trades.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <ApplyRow />
        </PillPopover>

        <PillPopover id="f-status" label={filters.status ? `Status: ${STATUS_LABELS[filters.status]}` : "Status"} active={Boolean(filters.status)}>
          <label className="block w-56">
            <span className="field-label">Status</span>
            <select name="status" defaultValue={filters.status ?? ""} className="field-input">
              <option value="">Any status</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <ApplyRow />
        </PillPopover>

        <PillPopover
          id="f-location"
          label={filters.city || filters.state ? `Location: ${[filters.city, filters.state].filter(Boolean).join(", ")}` : "Location"}
          active={Boolean(filters.city || filters.state)}
        >
          <div className="grid w-64 grid-cols-[1fr_6rem] gap-3">
            <label>
              <span className="field-label">Town</span>
              <input name="city" defaultValue={filters.city} className="field-input" />
            </label>
            <label>
              <span className="field-label">State</span>
              <select name="state" defaultValue={filters.state ?? ""} className="field-input">
                <option value="">Any</option>
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ApplyRow />
        </PillPopover>

        <PillPopover id="f-site" label={filters.site ? "Website: filtered" : "Website"} active={Boolean(filters.site)}>
          <fieldset className="w-72 space-y-1">
            <legend className="field-label mb-1">Website</legend>
            {[["", "Any"], ...Object.entries(SITE_FILTERS)].map(([value, label]) => (
              <label key={value} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="site"
                  value={value}
                  defaultChecked={(filters.site ?? "") === value}
                  className="size-4 accent-[var(--color-accent)]"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <ApplyRow />
        </PillPopover>

        <PillPopover
          id="f-score"
          label={rangeLabel("Site score", filters.scoreMin, filters.scoreMax)}
          active={filters.scoreMin !== undefined || filters.scoreMax !== undefined}
        >
          <fieldset className="grid w-56 grid-cols-2 gap-3">
            <legend className="field-label">Site score (0 to 100)</legend>
            <label>
              <span className="sr-only">Minimum site score</span>
              <input name="scoreMin" type="number" min={0} max={100} defaultValue={filters.scoreMin} placeholder="Min" className="field-input" />
            </label>
            <label>
              <span className="sr-only">Maximum site score</span>
              <input name="scoreMax" type="number" min={0} max={100} defaultValue={filters.scoreMax} placeholder="Max" className="field-input" />
            </label>
          </fieldset>
          <ApplyRow />
        </PillPopover>

        <PillPopover
          id="f-rating"
          label={rangeLabel("Rating", filters.ratingMin, filters.ratingMax)}
          active={filters.ratingMin !== undefined || filters.ratingMax !== undefined}
        >
          <fieldset className="grid w-56 grid-cols-2 gap-3">
            <legend className="field-label">Google rating (0 to 5)</legend>
            <label>
              <span className="sr-only">Minimum rating</span>
              <input
                name="ratingMin"
                type="number"
                min={0}
                max={5}
                step={0.1}
                defaultValue={filters.ratingMin}
                placeholder="Min"
                className="field-input"
              />
            </label>
            <label>
              <span className="sr-only">Maximum rating</span>
              <input
                name="ratingMax"
                type="number"
                min={0}
                max={5}
                step={0.1}
                defaultValue={filters.ratingMax}
                placeholder="Max"
                className="field-input"
              />
            </label>
          </fieldset>
          <ApplyRow />
        </PillPopover>

        <PillPopover id="f-phone" label={filters.phone ? PHONE_FILTERS[filters.phone] : "Phone"} active={Boolean(filters.phone)}>
          <fieldset className="w-60 space-y-1">
            <legend className="field-label mb-1">Phone number</legend>
            {[["", "Any"], ...Object.entries(PHONE_FILTERS)].map(([value, label]) => (
              <label key={value} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="phone"
                  value={value}
                  defaultChecked={(filters.phone ?? "") === value}
                  className="size-4 accent-[var(--color-accent)]"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <ApplyRow />
        </PillPopover>

        <PillPopover
          id="f-reviews"
          label={rangeLabel("Reviews", filters.reviewsMin, filters.reviewsMax)}
          active={filters.reviewsMin !== undefined || filters.reviewsMax !== undefined}
        >
          <fieldset className="grid w-56 grid-cols-2 gap-3">
            <legend className="field-label">Review count</legend>
            <label>
              <span className="sr-only">Minimum reviews</span>
              <input name="reviewsMin" type="number" min={0} defaultValue={filters.reviewsMin} placeholder="Min" className="field-input" />
            </label>
            <label>
              <span className="sr-only">Maximum reviews</span>
              <input name="reviewsMax" type="number" min={0} defaultValue={filters.reviewsMax} placeholder="Max" className="field-input" />
            </label>
          </fieldset>
          <ApplyRow />
        </PillPopover>

        <button type="submit" className="btn-primary">
          Search
        </button>
      </div>

      {chips.length > 0 && (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.label}>
              <Link
                href={chip.href}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent-soft py-1 pr-2 pl-3 text-[13px] font-medium text-accent hover:bg-accent/15"
              >
                {chip.label}
                <CloseIcon className="size-3.5" />
                <span className="sr-only">(remove filter)</span>
              </Link>
            </li>
          ))}
          <li>
            <Link href="/leads" className="btn-link text-[13px]">
              Clear all
            </Link>
          </li>
        </ul>
      )}
    </form>
  );
}
