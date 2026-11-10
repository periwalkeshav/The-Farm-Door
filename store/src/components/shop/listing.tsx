import Link from "next/link";
import { getCategories, getProducts, getSearchCorrection } from "@/data/catalog";
import { getI18n } from "@/i18n/server";
import type { SortKey } from "@/server/catalog/queries";
import { ProductGrid } from "./product-card";
import { ListingControls } from "./listing-controls";

export const SORTS: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "bestselling", label: "Bestselling" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

export function parseSort(value: unknown): SortKey {
  return SORTS.some((s) => s.value === value) ? (value as SortKey) : "featured";
}

/** Product listing with search, category chips, sort and in-stock filter. */
export async function Listing(props: {
  basePath: string;
  q?: string;
  sort: SortKey;
  inStockOnly: boolean;
  categorySlug?: string;
  collectionSlug?: string;
  showCategoryChips?: boolean;
  autoFocusSearch?: boolean;
  /** Extra filters kept in the address when searching or sorting. */
  keep?: Record<string, string>;
  /** Filter buttons to show instead of the category ones (e.g. Whole / Ground inside Spices). */
  chips?: { href: string; label: string; current: boolean }[];
  chipsLabel?: string;
}) {
  const { lang, t, href } = await getI18n();
  const base = href(props.basePath);
  const [products, categories] = await Promise.all([
    getProducts({ q: props.q, sort: props.sort, inStockOnly: props.inStockOnly, categorySlug: props.categorySlug, collectionSlug: props.collectionSlug, lang }),
    props.showCategoryChips ? getCategories(lang) : Promise.resolve([]),
  ]);
  const correction = props.q && products.length === 0 ? await getSearchCorrection(props.q) : null;
  const chips = props.chips ?? (categories.length ? [{ href: href("/shop"), label: t("All"), current: true }, ...categories.map((c) => ({ href: href(`/category/${c.slug}`), label: c.name, current: false }))] : []);
  return (
    <>
      <ListingControls basePath={base} q={props.q ?? ""} sort={props.sort} inStockOnly={props.inStockOnly} sorts={SORTS.map((s) => ({ ...s, label: t(s.label) }))} autoFocusSearch={props.autoFocusSearch} keep={props.keep} />
      {chips.length > 0 && (
        <nav aria-label={props.chipsLabel ?? t("Categories")} className="mb-6 flex flex-wrap gap-2">
          {chips.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              aria-current={c.current ? "page" : undefined}
              className={
                c.current
                  ? "rounded-full border border-forest bg-forest px-3.5 py-1.5 text-sm font-semibold text-ivory"
                  : "rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm font-semibold text-forest hover:border-forest"
              }
            >
              {c.label}
            </Link>
          ))}
        </nav>
      )}
      <p className="mb-4 text-sm text-muted" aria-live="polite">
        {t(products.length === 1 ? "{count} product" : "{count} products", { count: products.length })}
        {props.q ? ` ${t("for “{q}”", { q: props.q })}` : ""}
      </p>
      {products.length ? (
        <>
          {/* Keeps the heading levels in order: page title (h1), this, then each product (h3). */}
          <h2 className="sr-only">{t("Products")}</h2>
          <ProductGrid products={products} priorityCount={4} />
        </>
      ) : (
        <div className="card p-10 text-center">
          <p className="font-display text-xl text-forest">{t("Nothing found")}</p>
          {correction ? (
            <p className="mt-2 text-muted">
              {t("Did you mean")}{" "}
              <Link href={`${base}?q=${encodeURIComponent(correction)}`} className="font-bold text-forest underline">
                {correction}
              </Link>
              ?
            </p>
          ) : (
            <p className="mt-2 text-muted">{t("Try a different search, or browse all our products. You can also search in Hindi, like haldi or jeera.")}</p>
          )}
          <Link href={href("/shop")} className="mt-4 inline-block font-bold text-forest underline">
            {t("See all products")}
          </Link>
        </div>
      )}
    </>
  );
}
