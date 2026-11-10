"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useI18n } from "@/i18n/client";
import { SearchBox } from "./search-box";

export function ListingControls(props: {
  basePath: string;
  q: string;
  sort: string;
  inStockOnly: boolean;
  sorts: { value: string; label: string }[];
  autoFocusSearch?: boolean;
  /** Filters to keep when searching or sorting (e.g. the chosen group on a category page). */
  keep?: Record<string, string>;
}) {
  const router = useRouter();
  const { lang, t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);

  function submit() {
    const data = new FormData(formRef.current!);
    const params = new URLSearchParams(props.keep);
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
      aria-label={t("Search and sort these products")}
      className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {Object.entries(props.keep ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex flex-1 gap-2">
        <SearchBox
          label={t("Search")}
          defaultValue={props.q}
          placeholder={t("Search turmeric, haldi, jeera, garam masala…")}
          hints={lang === "hi" ? ["हल्दी", "जीरा", "तूर दाल", "सरसों का तेल", "गरम मसाला", "बासमती"] : ["turmeric or haldi", "jeera", "toor dal", "mustard oil", "garam masala", "basmati"]}
          autoFocus={props.autoFocusSearch}
          className="flex-1"
          inputClassName="field"
        />
        <button type="submit" className="rounded-xl bg-forest px-4 font-semibold text-ivory">
          {t("Search")}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold whitespace-nowrap text-forest">
          <input type="checkbox" name="instock" defaultChecked={props.inStockOnly} onChange={submit} className="size-4 accent-forest" />
          {t("In stock only")}
        </label>
        <label htmlFor="listing-sort" className="sr-only">
          {t("Sort by")}
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
