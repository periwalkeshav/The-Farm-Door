/**
 * Cached storefront reads. Catalogue data is cached and refreshed when the
 * admin edits it (tag "catalog"); stock-sensitive data also carries the "stock"
 * tag, refreshed whenever stock changes, and expires within minutes regardless.
 */
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import * as q from "@/server/catalog/queries";
import { readAllSettings } from "@/server/settings";

export async function getCategories() {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  return q.listCategories(getDb());
}

export async function getProducts(opts: Parameters<typeof q.listProducts>[1]) {
  "use cache";
  cacheTag("catalog", "stock");
  cacheLife("minutes");
  return q.listProducts(getDb(), opts);
}

export async function getHomeCollections() {
  "use cache";
  cacheTag("catalog", "stock");
  cacheLife("minutes");
  return q.getHomeCollections(getDb());
}

export async function getProduct(slug: string) {
  "use cache";
  cacheTag("catalog", "stock", `product:${slug}`);
  cacheLife("minutes");
  return q.getProductBySlug(getDb(), slug);
}

export async function getRelated(productId: number, categoryId: number | null) {
  "use cache";
  cacheTag("catalog", "stock");
  cacheLife("minutes");
  return q.relatedProducts(getDb(), { id: productId, category: categoryId ? { id: categoryId } : null });
}

export async function getCategoryBySlug(slug: string) {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  return q.getCategory(getDb(), slug);
}

export async function getCollectionBySlug(slug: string) {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  return q.getCollection(getDb(), slug);
}

export async function getTestimonials() {
  "use cache";
  cacheTag("catalog", "reviews");
  cacheLife("hours");
  return q.latestReviews(getDb());
}

/** Public business details for the footer, contact and policy pages. */
export async function getPublicSettings() {
  "use cache";
  cacheTag("settings");
  cacheLife("hours");
  const s = await readAllSettings(getDb());
  return { store: s.store, shipping: { freeShippingThresholdPaise: s.shipping.freeShippingThresholdPaise }, cod: { enabled: s.cod.enabled, feePaise: s.cod.feePaise, maxOrderPaise: s.cod.maxOrderPaise, confirmationHours: s.cod.confirmationHours } };
}
