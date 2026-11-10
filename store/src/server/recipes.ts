/** Recipes: written in the admin, shown at /recipes and on the product pages of the spices they use. */
import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import type { Locale } from "@/i18n/config";
import { recipes } from "@/db/schema";
import { slugify } from "./catalog/admin";

export type RecipeRow = typeof recipes.$inferSelect;
export class RecipeError extends Error {}

export const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

/** A recipe in the page's language: Hindi fields replace English ones that have been filled in. */
function localized(r: RecipeRow, lang?: Locale): RecipeRow {
  if (lang !== "hi") return r;
  const pick = (en: string, hi: string) => (hi.trim() ? hi : en);
  return { ...r, title: pick(r.title, r.titleHi), summary: pick(r.summary, r.summaryHi), ingredients: pick(r.ingredients, r.ingredientsHi), method: pick(r.method, r.methodHi) };
}

export async function publishedRecipes(db: DbOrTx, limit = 60, lang?: Locale) {
  const rows = await db.select().from(recipes).where(eq(recipes.status, "PUBLISHED")).orderBy(desc(recipes.publishedAt)).limit(limit);
  return rows.map((r) => localized(r, lang));
}

export async function publishedRecipe(db: DbOrTx, slug: string, lang?: Locale) {
  const [r] = await db.select().from(recipes).where(and(eq(recipes.slug, slug), eq(recipes.status, "PUBLISHED")));
  return r ? localized(r, lang) : null;
}

export async function recipesUsingProduct(db: DbOrTx, productId: number, limit = 4, lang?: Locale) {
  return db
    .select({ slug: recipes.slug, title: lang === "hi" ? sql<string>`coalesce(nullif(${recipes.titleHi}, ''), ${recipes.title})` : recipes.title, imageId: recipes.imageId })
    .from(recipes)
    .where(and(eq(recipes.status, "PUBLISHED"), sql`${productId} = any(${recipes.productIds})`))
    .orderBy(desc(recipes.publishedAt))
    .limit(limit);
}

async function freeSlug(db: DbOrTx, wanted: string, excludeId: number | null) {
  const base = slugify(wanted) || "recipe";
  for (let i = 0; i < 50; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const [hit] = await db.select({ id: recipes.id }).from(recipes).where(excludeId ? and(eq(recipes.slug, slug), ne(recipes.id, excludeId)) : eq(recipes.slug, slug));
    if (!hit) return slug;
  }
  throw new RecipeError("Couldn't find a free web address for this recipe.");
}

export type RecipeInput = {
  title: string;
  slug: string;
  summary: string;
  prepMinutes: number | null;
  cookMinutes: number | null;
  serves: number | null;
  ingredients: string;
  method: string;
  productIds: number[];
  status: "DRAFT" | "PUBLISHED";
};

export async function saveRecipe(db: DbOrTx, id: number | null, input: RecipeInput, imageId?: number | null) {
  const existing = id ? (await db.select().from(recipes).where(eq(recipes.id, id)))[0] : null;
  if (id && !existing) throw new RecipeError("Recipe not found.");
  const slug = await freeSlug(db, input.slug || input.title, id);
  const values = {
    ...input,
    slug,
    productIds: [...new Set(input.productIds)],
    publishedAt: input.status === "PUBLISHED" ? (existing?.publishedAt ?? new Date()) : (existing?.publishedAt ?? null),
    ...(imageId !== undefined ? { imageId } : {}),
  };
  if (existing) {
    const [row] = await db.update(recipes).set(values).where(eq(recipes.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(recipes).values(values).returning();
  return row;
}
