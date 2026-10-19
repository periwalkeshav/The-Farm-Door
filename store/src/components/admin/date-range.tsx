"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/components/ui";

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "mtd", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "fytd", label: "This FY" },
];

/** Date range filter: presets first, custom range after. Scopes everything on the page. */
export function DateRangeFilter({ active, fromDate, toDate }: { active: string; fromDate: string; toDate: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const href = (key: string) => {
    const p = new URLSearchParams(params);
    p.set("range", key);
    p.delete("from");
    p.delete("to");
    return `${pathname}?${p}`;
  };
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <Link
          key={p.key}
          href={href(p.key)}
          aria-current={active === p.key}
          className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", active === p.key ? "border-forest bg-forest text-ivory" : "border-line bg-paper text-forest hover:border-forest")}
        >
          {p.label}
        </Link>
      ))}
      <form action={pathname} className="flex flex-wrap items-center gap-2 border-l border-line pl-3">
        {[...params.entries()]
          .filter(([k]) => !["range", "from", "to"].includes(k))
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <input type="hidden" name="range" value="custom" />
        <label className="sr-only" htmlFor="dr-from">
          From
        </label>
        <input id="dr-from" type="date" name="from" defaultValue={fromDate} className="field w-auto py-1.5 text-sm" />
        <span className="text-sm text-muted">to</span>
        <label className="sr-only" htmlFor="dr-to">
          To
        </label>
        <input id="dr-to" type="date" name="to" defaultValue={toDate} className="field w-auto py-1.5 text-sm" />
        <button type="submit" className="rounded-full border border-forest px-3 py-1.5 text-sm font-semibold text-forest">
          Apply
        </button>
      </form>
    </div>
  );
}
