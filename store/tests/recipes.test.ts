import { beforeEach, describe, expect, it } from "vitest";
import { recipeSchema } from "@/lib/form-schemas";
import { lines, publishedRecipe, recipesUsingProduct, saveRecipe, type RecipeInput } from "@/server/recipes";
import { db, makeProductWithVariant, resetDb } from "./support/db";

const base: RecipeInput = { title: "Dal tadka", slug: "", summary: "", prepMinutes: 10, cookMinutes: 25, serves: 4, ingredients: "1 cup toor dal\n1 tsp turmeric", method: "Boil the dal.\nTemper the spices.", productIds: [], status: "PUBLISHED" };

describe("recipes", () => {
  beforeEach(resetDb);

  it("turns lines into ingredients and steps, dropping bullets and numbers", () => {
    expect(lines("- 1 cup dal\n\n2) Boil it\n • Serve")).toEqual(["1 cup dal", "Boil it", "Serve"]);
  });

  it("needs ingredients and a method to publish, not to save a draft", () => {
    const draft = recipeSchema.safeParse({ title: "Chai masala", slug: "", status: "DRAFT" });
    expect(draft.success).toBe(true);
    const publish = recipeSchema.safeParse({ title: "Chai masala", slug: "", status: "PUBLISHED" });
    expect(publish.success).toBe(false);
  });

  it("gets a unique web address and shows on the products it uses once published", async () => {
    const { product } = await makeProductWithVariant();
    const first = await saveRecipe(db, null, { ...base, productIds: [product.id, product.id] });
    const second = await saveRecipe(db, null, { ...base, status: "DRAFT" });
    expect([first.slug, second.slug]).toEqual(["dal-tadka", "dal-tadka-2"]);
    expect(first.productIds).toEqual([product.id]);
    expect((await recipesUsingProduct(db, product.id)).map((r) => r.slug)).toEqual(["dal-tadka"]);
    expect(await publishedRecipe(db, "dal-tadka-2")).toBeNull();
  });
});
