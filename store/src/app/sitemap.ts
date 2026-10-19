import { and, eq } from "drizzle-orm";
import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { categories, collections } from "@/db/schema";
import { allProductSlugs } from "@/server/catalog/queries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const db = getDb();
  const [products, cats, cols] = await Promise.all([
    allProductSlugs(db),
    db.select({ slug: categories.slug }).from(categories).where(eq(categories.isActive, true)),
    db.select({ slug: collections.slug }).from(collections).where(and(eq(collections.isActive, true))),
  ]);
  const page = (path: string, priority: number, lastModified?: Date) => ({ url: `${base}${path}`, priority, lastModified });
  return [
    page("/", 1),
    page("/shop", 0.9),
    ...cats.map((c) => page(`/category/${c.slug}`, 0.8)),
    ...cols.map((c) => page(`/collections/${c.slug}`, 0.7)),
    ...products.map((p) => page(`/products/${p.slug}`, 0.8, p.updatedAt)),
    ...["/about", "/contact", "/faq", "/policies/shipping", "/policies/refunds", "/policies/privacy", "/policies/terms"].map((p) => page(p, 0.3)),
  ];
}
