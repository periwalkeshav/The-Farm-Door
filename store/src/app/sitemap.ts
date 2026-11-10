import { and, eq } from "drizzle-orm";
import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { categories, collections } from "@/db/schema";
import { allProductSlugs } from "@/server/catalog/queries";
import { publishedRecipes } from "@/server/recipes";
import { localePath } from "@/i18n/config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheTag("catalog", "recipes");
  cacheLife("hours");
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const db = getDb();
  const [products, cats, cols, recipeList] = await Promise.all([
    allProductSlugs(db),
    db.select({ slug: categories.slug }).from(categories).where(eq(categories.isActive, true)),
    db.select({ slug: collections.slug }).from(collections).where(and(eq(collections.isActive, true))),
    publishedRecipes(db, 500),
  ]);
  // Each page is listed once, with its Hindi version as an alternate.
  const page = (path: string, priority: number, lastModified?: Date) => ({
    url: `${base}${path}`,
    priority,
    lastModified,
    alternates: { languages: { "en-IN": `${base}${path}`, "hi-IN": `${base}${localePath("hi", path)}` } },
  });
  return [
    page("/", 1),
    page("/shop", 0.9),
    ...cats.map((c) => page(`/category/${c.slug}`, 0.8)),
    ...cols.map((c) => page(`/collections/${c.slug}`, 0.7)),
    ...products.map((p) => page(`/products/${p.slug}`, 0.8, p.updatedAt)),
    ...(recipeList.length ? [page("/recipes", 0.6), ...recipeList.map((r) => page(`/recipes/${r.slug}`, 0.5, r.updatedAt))] : []),
    ...["/about", "/contact", "/bulk-orders", "/faq", "/policies/shipping", "/policies/refunds", "/policies/privacy", "/policies/terms"].map((p) => page(p, 0.3)),
  ];
}
