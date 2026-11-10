/**
 * Cached storefront reads. Catalogue data is cached and refreshed when the
 * admin edits it (tag "catalog"); stock-sensitive data also carries the "stock"
 * tag, refreshed whenever stock changes, and expires within minutes regardless.
 */
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import type { Locale } from "@/i18n/config";
import * as q from "@/server/catalog/queries";
import { env } from "@/lib/env";
import { googleMerchantFeed } from "@/server/feeds";
import { boxContentsForProduct } from "@/server/kits";
import { featuredCoupon } from "@/server/coupons";
import { activeSales } from "@/server/sales";
import { readAllSettings } from "@/server/settings";

export async function getCategories(lang: Locale = "en") {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  return q.listCategories(getDb(), lang);
}

export async function getProducts(opts: Parameters<typeof q.listProducts>[1]) {
  "use cache";
  cacheTag("catalog", "stock");
  cacheLife("minutes");
  return q.listProducts(getDb(), opts);
}

export async function getHomeCollections(lang: Locale = "en") {
  "use cache";
  cacheTag("catalog", "stock");
  cacheLife("minutes");
  return q.getHomeCollections(getDb(), lang);
}

export async function getProduct(slug: string, lang: Locale = "en") {
  "use cache";
  cacheTag("catalog", "stock", `product:${slug}`);
  cacheLife("minutes");
  return q.getProductBySlug(getDb(), slug, lang);
}

export async function getRelated(productId: number, categoryId: number | null, lang: Locale = "en") {
  "use cache";
  cacheTag("catalog", "stock");
  cacheLife("minutes");
  return q.relatedProducts(getDb(), { id: productId, category: categoryId ? { id: categoryId } : null }, lang);
}

export async function getCategoryBySlug(slug: string, lang: Locale = "en") {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  return q.getCategory(getDb(), slug, lang);
}

export async function getCategoryGroups(categoryId: number, lang: Locale = "en") {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  return q.categoryGroups(getDb(), categoryId, lang);
}

export async function getCollectionBySlug(slug: string, lang: Locale = "en") {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  return q.getCollection(getDb(), slug, lang);
}

export async function getTestimonials(lang: Locale = "en") {
  "use cache";
  cacheTag("catalog", "reviews");
  cacheLife("hours");
  return q.latestReviews(getDb(), 6, lang);
}

/** Public business details for the footer, contact and policy pages. */
export async function getPublicSettings() {
  "use cache";
  cacheTag("settings");
  cacheLife("hours");
  const s = await readAllSettings(getDb());
  return {
    store: s.store,
    analytics: { gaMeasurementId: s.analytics.gaMeasurementId },
    shipping: { freeShippingThresholdPaise: s.shipping.freeShippingThresholdPaise },
    cod: { enabled: s.cod.enabled, feePaise: s.cod.feePaise, maxOrderPaise: s.cod.maxOrderPaise, confirmationHours: s.cod.confirmationHours },
  };
}

/** Google Shopping feed XML, refreshed when the catalogue or stock changes. */
export async function getGoogleFeed() {
  "use cache";
  cacheTag("catalog", "stock");
  cacheLife("hours");
  return googleMerchantFeed(getDb(), env().APP_URL);
}

export async function getBoughtTogether(productId: number, lang: Locale = "en") {
  "use cache";
  cacheTag("catalog", "stock");
  cacheLife("hours");
  return q.boughtTogether(getDb(), productId, 4, lang);
}

/** Contents of gift boxes / combos, by variant id. */
export async function getBoxContents(productId: number) {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  return boxContentsForProduct(getDb(), productId);
}

/** Search-as-you-type suggestions (products, categories, spelling fix). */
export async function getSearchSuggestions(query: string, lang: Locale = "en") {
  "use cache";
  cacheTag("catalog", "stock");
  cacheLife("minutes");
  return q.searchSuggestions(getDb(), query, lang);
}

/** "Did you mean …?" for a search with no results. */
export async function getSearchCorrection(query: string) {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  return q.searchCorrection(getDb(), query);
}

/** The biggest sale running now, for banners (null when none). */
export async function getRunningSale() {
  "use cache";
  cacheTag("catalog");
  cacheLife("minutes");
  const [best] = await activeSales(getDb());
  return best ? { name: best.name, percent: best.percentOffBp / 100, scope: best.scope, endsAt: best.endsAt } : null;
}

/** Collections shown as "Shop by dish" chips on the home page. */
export async function getShopByCollections(lang: Locale = "en") {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  return q.shopByCollections(getDb(), lang);
}

/** The coupon code advertised in the scrolling banner, if any. */
export async function getFeaturedCoupon() {
  "use cache";
  cacheTag("coupons");
  cacheLife("minutes");
  return featuredCoupon(getDb());
}
