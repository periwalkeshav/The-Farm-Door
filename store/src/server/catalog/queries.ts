/**
 * Read queries for the storefront. Only ACTIVE products in active categories
 * are ever returned here. Stock is reported as "available to buy now".
 */
import { and, asc, desc, eq, gte, inArray, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import {
  categories,
  collectionProducts,
  collections,
  inventoryItems,
  orderItems,
  orders,
  productImages,
  products,
  productVariants,
  reviews,
  type ProductOption,
} from "@/db/schema";
import { discountPercent, pricePer100 } from "@/lib/money";
import { didYouMean, rankProducts, type SearchDoc } from "@/lib/search";
import type { Locale } from "@/i18n/config";
import { sellableQuantity } from "../inventory";
import { activeSales, priceWithSale, type SaleTag } from "../sales";
import { variantTitle } from "./variant-title";

export type ProductCard = {
  id: number;
  slug: string;
  name: string;
  subtitle: string;
  categoryName: string | null;
  imageId: number | null;
  /** Cheapest in-stock variant (or cheapest overall when all are sold out). */
  pricePaise: number;
  mrpPaise: number;
  discountPercent: number;
  per100gPaise: number | null;
  fromLabel: string; // e.g. "100 g" for the variant the price refers to
  variantCount: number;
  inStock: boolean;
  defaultVariantId: number | null; // for quick add when there's a single variant
  ratingAvg: number | null;
  ratingCount: number;
  /** The sale the price above comes from, if one is running. */
  sale: SaleTag | null;
  /** Every pack on sale, for choosing and adding from the card. `defaultPack` is the one priced above. */
  packs: { variantId: number; label: string; pricePaise: number; mrpPaise: number; inStock: boolean }[];
  defaultPack: number;
};

export type SortKey = "featured" | "price-asc" | "price-desc" | "newest" | "bestselling";

type VariantRow = {
  id: number;
  productId: number;
  /** After any running sale. */
  pricePaise: number;
  sale: SaleTag | null;
  mrpPaise: number;
  netWeightGrams: number;
  unitsPerSale: number;
  optionValues: Record<string, string>;
  available: number;
  isActive: boolean;
};

async function variantsFor(db: DbOrTx, productIds: number[]): Promise<Map<number, VariantRow[]>> {
  const map = new Map<number, VariantRow[]>();
  if (!productIds.length) return map;
  const [rows, running] = await Promise.all([
    db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      categoryId: products.categoryId,
      pricePaise: productVariants.pricePaise,
      mrpPaise: productVariants.mrpPaise,
      netWeightGrams: productVariants.netWeightGrams,
      unitsPerSale: productVariants.unitsPerSale,
      optionValues: productVariants.optionValues,
      isActive: productVariants.isActive,
      available: sql<number>`case when ${inventoryItems.isActive} then ${inventoryItems.onHand} - ${inventoryItems.reserved} else 0 end`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId))
    .where(and(inArray(productVariants.productId, productIds), eq(productVariants.isActive, true)))
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.pricePaise)),
    activeSales(db),
  ]);
  for (const { categoryId, ...r } of rows) {
    const list = map.get(r.productId) ?? [];
    const { pricePaise, sale } = priceWithSale(r.pricePaise, { id: r.productId, categoryId }, running);
    list.push({ ...r, pricePaise, sale, available: Number(r.available) });
    map.set(r.productId, list);
  }
  return map;
}

async function firstImages(db: DbOrTx, productIds: number[]) {
  const map = new Map<number, number>();
  if (!productIds.length) return map;
  const rows = await db
    .select({ productId: productImages.productId, mediaId: productImages.mediaId })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(asc(productImages.sortOrder), asc(productImages.id));
  for (const r of rows) if (!map.has(r.productId)) map.set(r.productId, r.mediaId);
  return map;
}

async function ratingsFor(db: DbOrTx, productIds: number[]) {
  const map = new Map<number, { avg: number; count: number }>();
  if (!productIds.length) return map;
  const rows = await db
    .select({ productId: reviews.productId, avg: sql<number>`avg(${reviews.rating})::float`, count: sql<number>`count(*)::int` })
    .from(reviews)
    .where(and(inArray(reviews.productId, productIds), eq(reviews.status, "APPROVED")))
    .groupBy(reviews.productId);
  for (const r of rows) map.set(r.productId, { avg: Math.round(r.avg * 10) / 10, count: r.count });
  return map;
}

type BaseProduct = { id: number; slug: string; name: string; subtitle: string; options: ProductOption[]; categoryName: string | null };

async function toCards(db: DbOrTx, base: BaseProduct[]): Promise<ProductCard[]> {
  const ids = base.map((p) => p.id);
  const [variants, images, ratings] = await Promise.all([variantsFor(db, ids), firstImages(db, ids), ratingsFor(db, ids)]);
  return base
    .map((p): ProductCard | null => {
      const vs = variants.get(p.id) ?? [];
      if (!vs.length) return null;
      const inStock = vs.filter((v) => sellableQuantity(v.available, v.unitsPerSale) > 0);
      const pick = [...(inStock.length ? inStock : vs)].sort((a, b) => a.pricePaise - b.pricePaise)[0];
      const rating = ratings.get(p.id);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        subtitle: p.subtitle,
        categoryName: p.categoryName,
        imageId: images.get(p.id) ?? null,
        pricePaise: pick.pricePaise,
        mrpPaise: pick.mrpPaise,
        discountPercent: discountPercent(pick.pricePaise, pick.mrpPaise),
        per100gPaise: pricePer100(pick.pricePaise, pick.netWeightGrams),
        fromLabel: variantTitle(p.options, pick.optionValues),
        variantCount: vs.length,
        inStock: inStock.length > 0,
        defaultVariantId: vs.length === 1 ? vs[0].id : null,
        ratingAvg: rating?.avg ?? null,
        ratingCount: rating?.count ?? 0,
        sale: pick.sale,
        packs: vs.map((v) => ({ variantId: v.id, label: variantTitle(p.options, v.optionValues), pricePaise: v.pricePaise, mrpPaise: v.mrpPaise, inStock: sellableQuantity(v.available, v.unitsPerSale) > 0 })),
        defaultPack: vs.indexOf(pick),
      };
    })
    .filter((c): c is ProductCard => c !== null);
}

/** The Hindi column when the page is in Hindi and it's filled in, else the English one. */
function loc(lang: Locale | undefined, en: AnyColumn, hi: AnyColumn) {
  return lang === "hi" ? sql<string>`coalesce(nullif(${hi}, ''), ${en})` : sql<string>`${en}`;
}

/** Same as loc(), for a row already read (both versions selected). */
export function pickLang(lang: Locale | undefined, en: string, hi: string | null | undefined) {
  return lang === "hi" && hi?.trim() ? hi : en;
}

const visible = () => and(eq(products.status, "ACTIVE"), or(sql`${products.categoryId} is null`, eq(categories.isActive, true)));

/** Visible categories that have at least one product on sale (an empty one would lead to an empty page). */
export async function listCategories(db: DbOrTx, lang?: Locale) {
  return db
    .select({ id: categories.id, slug: categories.slug, name: loc(lang, categories.name, categories.nameHi), description: loc(lang, categories.description, categories.descriptionHi), imageId: categories.imageId })
    .from(categories)
    .where(and(eq(categories.isActive, true), sql`exists (select 1 from ${products} where ${products.categoryId} = ${categories.id} and ${products.status} = 'ACTIVE')`))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function listProducts(
  db: DbOrTx,
  opts: { categorySlug?: string; collectionSlug?: string; q?: string; sort?: SortKey; inStockOnly?: boolean; limit?: number; excludeId?: number; categoryId?: number | null; ids?: number[]; lang?: Locale } = {},
): Promise<ProductCard[]> {
  const conditions: (SQL | undefined)[] = [visible()];
  if (opts.categorySlug) conditions.push(eq(categories.slug, opts.categorySlug));
  if (opts.categoryId) conditions.push(eq(products.categoryId, opts.categoryId));
  if (opts.excludeId) conditions.push(sql`${products.id} <> ${opts.excludeId}`);
  if (opts.ids) conditions.push(opts.ids.length ? inArray(products.id, opts.ids) : sql`false`);
  const q = opts.q?.trim().slice(0, 80);
  // Search results, best match first (Hindi names, typos; see src/lib/search.ts).
  const ranked = q ? rankProducts(await searchDocs(db), q) : null;
  if (ranked) conditions.push(ranked.length ? inArray(products.id, ranked) : sql`false`);

  let query = db
    .select({
      id: products.id,
      slug: products.slug,
      name: loc(opts.lang, products.name, products.nameHi),
      subtitle: loc(opts.lang, products.subtitle, products.subtitleHi),
      options: products.options,
      categoryName: loc(opts.lang, categories.name, categories.nameHi),
      isFeatured: products.isFeatured,
      publishedAt: products.publishedAt,
      collectionOrder: collectionProducts.sortOrder,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(
      collectionProducts,
      opts.collectionSlug
        ? and(eq(collectionProducts.productId, products.id), sql`${collectionProducts.collectionId} = (select id from ${collections} where ${collections.slug} = ${opts.collectionSlug} and ${collections.isActive})`)
        : sql`false`,
    )
    .$dynamic();
  if (opts.collectionSlug) conditions.push(sql`${collectionProducts.productId} is not null`);
  query = query.where(and(...conditions));

  const rows = await query.orderBy(
    opts.collectionSlug ? asc(collectionProducts.sortOrder) : desc(products.isFeatured),
    opts.sort === "newest" ? desc(products.publishedAt) : asc(products.name),
  );
  let cards = await toCards(db, rows);

  if (ranked && (!opts.sort || opts.sort === "featured")) cards.sort((a, b) => ranked.indexOf(a.id) - ranked.indexOf(b.id));
  switch (opts.sort) {
    case "price-asc":
      cards.sort((a, b) => a.pricePaise - b.pricePaise);
      break;
    case "price-desc":
      cards.sort((a, b) => b.pricePaise - a.pricePaise);
      break;
    case "bestselling": {
      const sales = await unitsSold(db, cards.map((c) => c.id));
      cards.sort((a, b) => (sales.get(b.id) ?? 0) - (sales.get(a.id) ?? 0));
      break;
    }
  }
  if (opts.inStockOnly) cards = cards.filter((c) => c.inStock);
  // Sold-out items go last, except when sorting by price.
  if (opts.sort !== "price-asc" && opts.sort !== "price-desc") cards.sort((a, b) => Number(b.inStock) - Number(a.inStock));
  return opts.limit ? cards.slice(0, opts.limit) : cards;
}

/** Units sold in the last 90 days (confirmed orders only). */
async function unitsSold(db: DbOrTx, productIds: number[]) {
  const map = new Map<number, number>();
  if (!productIds.length) return map;
  const rows = await db
    .select({ productId: orderItems.productId, units: sql<number>`sum(${orderItems.quantity})::int` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(inArray(orderItems.productId, productIds), sql`${orders.confirmedAt} is not null`, gte(orders.confirmedAt, sql`now() - interval '90 days'`)))
    .groupBy(orderItems.productId);
  for (const r of rows) if (r.productId) map.set(r.productId, r.units);
  return map;
}

/** What search looks at for every product on sale: names, tags, category, options and description. */
export async function searchDocs(db: DbOrTx): Promise<SearchDoc[]> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      subtitle: products.subtitle,
      tags: products.tags,
      category: categories.name,
      options: products.options,
      description: products.description,
      nameHi: products.nameHi,
      subtitleHi: products.subtitleHi,
      categoryHi: categories.nameHi,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(visible())
    .orderBy(desc(products.isFeatured), asc(products.name));
  // Hindi names count as extra names, so "हल्दी पाउडर" finds turmeric in either language.
  return rows.map(({ nameHi, subtitleHi, categoryHi, ...r }) => ({
    ...r,
    tags: [...r.tags, nameHi, subtitleHi, categoryHi ?? ""].filter(Boolean),
    options: r.options.flatMap((o) => o.values),
    description: r.description.slice(0, 600),
  }));
}

/** Suggestions while typing in a search box: a few products and categories, and a spelling fix when nothing matches. */
export async function searchSuggestions(db: DbOrTx, query: string, lang?: Locale) {
  const q = query.trim().slice(0, 60);
  if (q.length < 2) return { products: [], categories: [], didYouMean: null };
  const docs = await searchDocs(db);
  const ids = rankProducts(docs, q, { prefix: true }).slice(0, 6);
  const cards = ids.length ? await listProducts(db, { ids, lang }) : [];
  const cats = await listCategories(db, lang);
  const catIds = rankProducts(cats.map((c) => ({ id: c.id, name: c.name, subtitle: "", tags: [], category: null, options: [], description: "" })), q, { prefix: true });
  return {
    products: ids.map((id) => cards.find((c) => c.id === id)).filter((c): c is ProductCard => !!c).map((c) => ({ slug: c.slug, name: c.name, imageId: c.imageId, pricePaise: c.pricePaise, fromLabel: c.fromLabel, inStock: c.inStock })),
    categories: catIds.slice(0, 3).map((id) => cats.find((c) => c.id === id)!).map((c) => ({ slug: c.slug, name: c.name })),
    didYouMean: ids.length ? null : didYouMean(docs, q),
  };
}

export async function searchCorrection(db: DbOrTx, query: string) {
  return didYouMean(await searchDocs(db), query.trim().slice(0, 80));
}

export async function getHomeCollections(db: DbOrTx, lang?: Locale) {
  const cols = await db.select().from(collections).where(and(eq(collections.isActive, true), eq(collections.showOnHome, true))).orderBy(asc(collections.sortOrder));
  return Promise.all(
    cols.map(async (c) => ({ ...c, name: pickLang(lang, c.name, c.nameHi), description: pickLang(lang, c.description, c.descriptionHi), products: await listProducts(db, { collectionSlug: c.slug, limit: 8, lang }) })),
  );
}

/** Collections owners tick for the home page's "Shop by dish" row. */
export async function shopByCollections(db: DbOrTx, lang?: Locale) {
  return db
    .select({ slug: collections.slug, name: loc(lang, collections.name, collections.nameHi) })
    .from(collections)
    .where(and(eq(collections.isActive, true), eq(collections.showInShopBy, true)))
    .orderBy(asc(collections.sortOrder), asc(collections.name));
}

export async function getCollection(db: DbOrTx, slug: string, lang?: Locale) {
  const [c] = await db.select().from(collections).where(and(eq(collections.slug, slug), eq(collections.isActive, true)));
  return c ? { ...c, name: pickLang(lang, c.name, c.nameHi), description: pickLang(lang, c.description, c.descriptionHi) } : null;
}

/** Collections shown as filter buttons on a category's page ("Whole spices" inside Spices). */
export async function categoryGroups(db: DbOrTx, categoryId: number, lang?: Locale) {
  return db
    .select({ slug: collections.slug, name: loc(lang, collections.name, collections.nameHi) })
    .from(collections)
    .where(and(eq(collections.isActive, true), eq(collections.categoryId, categoryId)))
    .orderBy(asc(collections.sortOrder), asc(collections.name));
}

export async function getCategory(db: DbOrTx, slug: string, lang?: Locale) {
  const [c] = await db.select().from(categories).where(and(eq(categories.slug, slug), eq(categories.isActive, true)));
  return c ? { ...c, name: pickLang(lang, c.name, c.nameHi), description: pickLang(lang, c.description, c.descriptionHi) } : null;
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

export async function getProductBySlug(db: DbOrTx, slug: string, lang?: Locale) {
  const [p] = await db
    .select({ product: products, category: { id: categories.id, slug: categories.slug, name: loc(lang, categories.name, categories.nameHi), isActive: categories.isActive } })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.slug, slug), eq(products.status, "ACTIVE")));
  if (!p || (p.category && !p.category.isActive)) return null;
  const product = p.product;

  const [variantMap, images, rating, latestReviews, breakdown] = await Promise.all([
    variantsFor(db, [product.id]),
    db
      .select({ mediaId: productImages.mediaId, alt: productImages.alt })
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.sortOrder), asc(productImages.id)),
    ratingsFor(db, [product.id]),
    // The reviewer's delivery city (from the order they reviewed) is shown with the review; the review form says so.
    db
      .select({ id: reviews.id, rating: reviews.rating, title: reviews.title, body: reviews.body, authorName: reviews.authorName, createdAt: reviews.createdAt, city: orders.shipCity })
      .from(reviews)
      .leftJoin(orders, eq(orders.id, reviews.orderId))
      .where(and(eq(reviews.productId, product.id), eq(reviews.status, "APPROVED")))
      .orderBy(desc(reviews.createdAt))
      .limit(20),
    db
      .select({ stars: reviews.rating, n: sql<number>`count(*)::int` })
      .from(reviews)
      .where(and(eq(reviews.productId, product.id), eq(reviews.status, "APPROVED")))
      .groupBy(reviews.rating),
  ]);
  const fullVariants = await db
    .select({ id: productVariants.id, sku: productVariants.sku, hsnCode: productVariants.hsnCode, shelfLifeOverride: productVariants.shelfLifeOverride, shippingWeightGrams: productVariants.shippingWeightGrams })
    .from(productVariants)
    .where(eq(productVariants.productId, product.id));
  const extra = new Map(fullVariants.map((v) => [v.id, v]));

  const variants = (variantMap.get(product.id) ?? []).map((v) => ({
    id: v.id,
    title: variantTitle(product.options, v.optionValues),
    optionValues: v.optionValues,
    pricePaise: v.pricePaise,
    mrpPaise: v.mrpPaise,
    discountPercent: discountPercent(v.pricePaise, v.mrpPaise),
    netWeightGrams: v.netWeightGrams,
    per100gPaise: pricePer100(v.pricePaise, v.netWeightGrams),
    sellable: Math.min(sellableQuantity(v.available, v.unitsPerSale), 20),
    shelfLife: extra.get(v.id)?.shelfLifeOverride || product.shelfLife,
    sale: v.sale,
  }));

  const name = pickLang(lang, product.name, product.nameHi);
  return {
    id: product.id,
    slug: product.slug,
    name,
    subtitle: pickLang(lang, product.subtitle, product.subtitleHi),
    description: pickLang(lang, product.description, product.descriptionHi),
    ingredients: pickLang(lang, product.ingredients, product.ingredientsHi),
    usageInstructions: pickLang(lang, product.usageInstructions, product.usageInstructionsHi),
    storageInstructions: pickLang(lang, product.storageInstructions, product.storageInstructionsHi),
    countryOfOrigin: product.countryOfOrigin,
    netUnit: product.netUnit,
    allergenInfo: product.allergenInfo,
    nutritionInfo: product.nutritionInfo,
    options: product.options.filter((o) => o.values.length > 0),
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    category: p.category ? { id: p.category.id, slug: p.category.slug, name: p.category.name } : null,
    images: images.map((i) => ({ mediaId: i.mediaId, alt: (lang === "hi" ? "" : i.alt) || name })),
    variants,
    rating: rating.get(product.id) ?? null,
    /** Number of approved reviews with 5, 4, 3, 2 and 1 stars. */
    ratingBreakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: breakdown.find((b) => b.stars === stars)?.n ?? 0 })),
    reviews: latestReviews,
  };
}

export async function relatedProducts(db: DbOrTx, product: { id: number; category: { id: number } | null }, lang?: Locale) {
  const sameCategory = product.category ? await listProducts(db, { categoryId: product.category.id, excludeId: product.id, limit: 4, lang }) : [];
  if (sameCategory.length >= 4) return sameCategory;
  const more = await listProducts(db, { excludeId: product.id, sort: "bestselling", limit: 8, lang });
  return [...sameCategory, ...more.filter((m) => !sameCategory.some((s) => s.id === m.id))].slice(0, 4);
}

export async function latestReviews(db: DbOrTx, limit = 6, lang?: Locale) {
  return db
    .select({ id: reviews.id, rating: reviews.rating, title: reviews.title, body: reviews.body, authorName: reviews.authorName, productName: loc(lang, products.name, products.nameHi), productSlug: products.slug })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(and(eq(reviews.status, "APPROVED"), eq(products.status, "ACTIVE"), gte(reviews.rating, 4)))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
}

export async function allProductSlugs(db: DbOrTx) {
  return db.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).where(eq(products.status, "ACTIVE"));
}

/** Products most often in the same confirmed orders as this one. Needs at least two shared orders, so it stays quiet until there's real data. */
export async function boughtTogether(db: DbOrTx, productId: number, limit = 4, lang?: Locale) {
  const rows = await db.execute<{ product_id: number; n: number }>(sql`
    select oi2.product_id, count(distinct oi2.order_id)::int as n
    from order_items oi1
    join orders o on o.id = oi1.order_id and o.confirmed_at is not null and o.status <> 'CANCELLED'
    join order_items oi2 on oi2.order_id = oi1.order_id and oi2.product_id is not null and oi2.product_id <> oi1.product_id
    where oi1.product_id = ${productId}
    group by oi2.product_id
    having count(distinct oi2.order_id) >= 2
    order by n desc
    limit 12`);
  const ids = rows.rows.map((r) => Number(r.product_id));
  if (!ids.length) return [];
  const cards = await listProducts(db, { ids, lang });
  return ids
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is ProductCard => !!c && c.inStock)
    .slice(0, limit);
}
