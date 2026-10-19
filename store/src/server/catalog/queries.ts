/**
 * Read queries for the storefront. Only ACTIVE products in active categories
 * are ever returned here. Stock is reported as "available to buy now".
 */
import { and, asc, desc, eq, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
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
import { discountPercent, pricePer100g } from "@/lib/money";
import { sellableQuantity } from "../inventory";
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
};

export type SortKey = "featured" | "price-asc" | "price-desc" | "newest" | "bestselling";

type VariantRow = {
  id: number;
  productId: number;
  pricePaise: number;
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
  const rows = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      pricePaise: productVariants.pricePaise,
      mrpPaise: productVariants.mrpPaise,
      netWeightGrams: productVariants.netWeightGrams,
      unitsPerSale: productVariants.unitsPerSale,
      optionValues: productVariants.optionValues,
      isActive: productVariants.isActive,
      available: sql<number>`case when ${inventoryItems.isActive} then ${inventoryItems.onHand} - ${inventoryItems.reserved} else 0 end`,
    })
    .from(productVariants)
    .innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId))
    .where(and(inArray(productVariants.productId, productIds), eq(productVariants.isActive, true)))
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.pricePaise));
  for (const r of rows) {
    const list = map.get(r.productId) ?? [];
    list.push({ ...r, available: Number(r.available) });
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
        per100gPaise: pricePer100g(pick.pricePaise, pick.netWeightGrams),
        fromLabel: variantTitle(p.options, pick.optionValues),
        variantCount: vs.length,
        inStock: inStock.length > 0,
        defaultVariantId: vs.length === 1 ? vs[0].id : null,
        ratingAvg: rating?.avg ?? null,
        ratingCount: rating?.count ?? 0,
      };
    })
    .filter((c): c is ProductCard => c !== null);
}

const visible = () => and(eq(products.status, "ACTIVE"), or(sql`${products.categoryId} is null`, eq(categories.isActive, true)));

export async function listCategories(db: DbOrTx) {
  return db
    .select({ id: categories.id, slug: categories.slug, name: categories.name, description: categories.description, imageId: categories.imageId })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function listProducts(
  db: DbOrTx,
  opts: { categorySlug?: string; collectionSlug?: string; q?: string; sort?: SortKey; inStockOnly?: boolean; limit?: number; excludeId?: number; categoryId?: number | null } = {},
): Promise<ProductCard[]> {
  const conditions: (SQL | undefined)[] = [visible()];
  if (opts.categorySlug) conditions.push(eq(categories.slug, opts.categorySlug));
  if (opts.categoryId) conditions.push(eq(products.categoryId, opts.categoryId));
  if (opts.excludeId) conditions.push(sql`${products.id} <> ${opts.excludeId}`);
  const q = opts.q?.trim().slice(0, 80);
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conditions.push(
      or(
        ilike(products.name, like),
        ilike(products.subtitle, like),
        ilike(products.description, like),
        ilike(categories.name, like),
        sql`exists (select 1 from unnest(${products.tags}) t where t ilike ${like})`,
      ),
    );
  }

  let query = db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      subtitle: products.subtitle,
      options: products.options,
      categoryName: categories.name,
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

export async function getHomeCollections(db: DbOrTx) {
  const cols = await db.select().from(collections).where(and(eq(collections.isActive, true), eq(collections.showOnHome, true))).orderBy(asc(collections.sortOrder));
  return Promise.all(cols.map(async (c) => ({ ...c, products: await listProducts(db, { collectionSlug: c.slug, limit: 8 }) })));
}

export async function getCollection(db: DbOrTx, slug: string) {
  const [c] = await db.select().from(collections).where(and(eq(collections.slug, slug), eq(collections.isActive, true)));
  return c ?? null;
}

export async function getCategory(db: DbOrTx, slug: string) {
  const [c] = await db.select().from(categories).where(and(eq(categories.slug, slug), eq(categories.isActive, true)));
  return c ?? null;
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

export async function getProductBySlug(db: DbOrTx, slug: string) {
  const [p] = await db
    .select({ product: products, category: { id: categories.id, slug: categories.slug, name: categories.name, isActive: categories.isActive } })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.slug, slug), eq(products.status, "ACTIVE")));
  if (!p || (p.category && !p.category.isActive)) return null;
  const product = p.product;

  const [variantMap, images, rating, latestReviews] = await Promise.all([
    variantsFor(db, [product.id]),
    db
      .select({ mediaId: productImages.mediaId, alt: productImages.alt })
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.sortOrder), asc(productImages.id)),
    ratingsFor(db, [product.id]),
    db
      .select({ id: reviews.id, rating: reviews.rating, title: reviews.title, body: reviews.body, authorName: reviews.authorName, createdAt: reviews.createdAt })
      .from(reviews)
      .where(and(eq(reviews.productId, product.id), eq(reviews.status, "APPROVED")))
      .orderBy(desc(reviews.createdAt))
      .limit(20),
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
    per100gPaise: pricePer100g(v.pricePaise, v.netWeightGrams),
    sellable: Math.min(sellableQuantity(v.available, v.unitsPerSale), 20),
    shelfLife: extra.get(v.id)?.shelfLifeOverride || product.shelfLife,
  }));

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    subtitle: product.subtitle,
    description: product.description,
    ingredients: product.ingredients,
    usageInstructions: product.usageInstructions,
    storageInstructions: product.storageInstructions,
    countryOfOrigin: product.countryOfOrigin,
    allergenInfo: product.allergenInfo,
    nutritionInfo: product.nutritionInfo,
    options: product.options.filter((o) => o.values.length > 0),
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    category: p.category ? { id: p.category.id, slug: p.category.slug, name: p.category.name } : null,
    images: images.map((i) => ({ mediaId: i.mediaId, alt: i.alt || product.name })),
    variants,
    rating: rating.get(product.id) ?? null,
    reviews: latestReviews,
  };
}

export async function relatedProducts(db: DbOrTx, product: { id: number; category: { id: number } | null }) {
  const sameCategory = product.category ? await listProducts(db, { categoryId: product.category.id, excludeId: product.id, limit: 4 }) : [];
  if (sameCategory.length >= 4) return sameCategory;
  const more = await listProducts(db, { excludeId: product.id, sort: "bestselling", limit: 8 });
  return [...sameCategory, ...more.filter((m) => !sameCategory.some((s) => s.id === m.id))].slice(0, 4);
}

export async function latestReviews(db: DbOrTx, limit = 6) {
  return db
    .select({ id: reviews.id, rating: reviews.rating, title: reviews.title, body: reviews.body, authorName: reviews.authorName, productName: products.name, productSlug: products.slug })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(and(eq(reviews.status, "APPROVED"), eq(products.status, "ACTIVE"), gte(reviews.rating, 4)))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
}

export async function allProductSlugs(db: DbOrTx) {
  return db.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).where(eq(products.status, "ACTIVE"));
}
