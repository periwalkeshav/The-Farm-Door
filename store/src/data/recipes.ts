import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import type { Locale } from "@/i18n/config";
import * as q from "@/server/catalog/queries";
import { publishedRecipe, publishedRecipes, recipesUsingProduct } from "@/server/recipes";

export async function getRecipes(lang: Locale = "en") {
  "use cache";
  cacheTag("recipes");
  cacheLife("hours");
  return publishedRecipes(getDb(), 60, lang);
}

export async function getRecipe(slug: string, lang: Locale = "en") {
  "use cache";
  cacheTag("recipes");
  cacheLife("hours");
  return publishedRecipe(getDb(), slug, lang);
}

export async function getRecipesForProduct(productId: number, lang: Locale = "en") {
  "use cache";
  cacheTag("recipes");
  cacheLife("hours");
  return recipesUsingProduct(getDb(), productId, 4, lang);
}

/** Product cards for the spices a recipe uses, in the recipe's order. */
export async function getRecipeProducts(ids: number[], lang: Locale = "en") {
  "use cache";
  cacheTag("catalog", "stock");
  cacheLife("minutes");
  if (!ids.length) return [];
  const cards = await q.listProducts(getDb(), { ids, lang });
  return ids.map((id) => cards.find((c) => c.id === id)).filter((c) => !!c);
}
