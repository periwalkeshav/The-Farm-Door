"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

export function ListingControls(props: {
  basePath: string;
  q: string;
  sort: string;
  inStockOnly: boolean;
  sorts: { value: string; label: string }[];
  autoFocusSearch?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  function submit() {
    const data = new FormData(formRef.current!);
    const params = new URLSearchParams();
    const q = String(data.get("q") ?? "").trim();
    if (q) params.set("q", q);
    const sort = String(data.get("sort") ?? "featured");
    if (sort !== "featured") params.set("sort", sort);
    if (data.get("instock")) params.set("instock", "1");
    router.push(`${props.basePath}${params.size ? `?${params}` : ""}`);
  }

  return (
    <form
      ref={formRef}
      role="search"
      className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-1 gap-2">
        <label htmlFor="listing-q" className="sr-only">
          Search
        </label>
        <input id="listing-q" name="q" type="search" defaultValue={props.q} placeholder="Search turmeric, jeera, garam masala…" autoFocus={props.autoFocusSearch} className="field flex-1" />
        <button type="submit" className="rounded-xl bg-forest px-4 font-semibold text-ivory">
          Search
        </button>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold whitespace-nowrap text-forest">
          <input type="checkbox" name="instock" defaultChecked={props.inStockOnly} onChange={submit} className="size-4 accent-forest" />
          In stock only
        </label>
        <label htmlFor="listing-sort" className="sr-only">
          Sort by
        </label>
        <select id="listing-sort" name="sort" defaultValue={props.sort} onChange={submit} className="field w-auto py-2">
          {props.sorts.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}
