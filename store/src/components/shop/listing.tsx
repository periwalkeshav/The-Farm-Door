import Link from "next/link";
import { getCategories, getProducts } from "@/data/catalog";
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
}) {
  const [products, categories] = await Promise.all([
    getProducts({ q: props.q, sort: props.sort, inStockOnly: props.inStockOnly, categorySlug: props.categorySlug, collectionSlug: props.collectionSlug }),
    props.showCategoryChips ? getCategories() : Promise.resolve([]),
  ]);
  return (
    <>
      <ListingControls basePath={props.basePath} q={props.q ?? ""} sort={props.sort} inStockOnly={props.inStockOnly} sorts={SORTS} autoFocusSearch={props.autoFocusSearch} />
      {categories.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link href="/shop" className="rounded-full border border-forest bg-forest px-3.5 py-1.5 text-sm font-semibold text-ivory">
            All
          </Link>
          {categories.map((c) => (
            <Link key={c.id} href={`/category/${c.slug}`} className="rounded-full border border-line bg-paper px-3.5 py-1.5 text-sm font-semibold text-forest hover:border-forest">
              {c.name}
            </Link>
          ))}
        </div>
      )}
      <p className="mb-4 text-sm text-muted" aria-live="polite">
        {products.length} product{products.length === 1 ? "" : "s"}
        {props.q ? ` for “${props.q}”` : ""}
      </p>
      {products.length ? (
        <ProductGrid products={products} priorityCount={4} />
      ) : (
        <div className="card p-10 text-center">
          <p className="font-display text-xl text-forest">Nothing found</p>
          <p className="mt-2 text-muted">Try a different search, or browse all our spices.</p>
          <Link href="/shop" className="mt-4 inline-block font-bold text-forest underline">
            See all products
          </Link>
        </div>
      )}
    </>
  );
}
