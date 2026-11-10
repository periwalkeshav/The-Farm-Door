import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { products } from "@/db/schema";
import { listProducts, searchSuggestions } from "@/server/catalog/queries";
import { db, makeProductWithVariant, resetDb } from "./support/db";

describe("shop search", () => {
  beforeEach(resetDb);

  it("finds products by Hindi name and with typos, best match first, and suggests while typing", async () => {
    const turmeric = await makeProductWithVariant();
    const cumin = await makeProductWithVariant();
    await db.update(products).set({ name: "Cumin Seeds", description: "Pairs well with turmeric." }).where(eq(products.id, cumin.product.id));

    // Cumin mentions turmeric in its description, so it comes second.
    expect((await listProducts(db, { q: "haldi" })).map((p) => p.id)).toEqual([turmeric.product.id, cumin.product.id]);
    expect((await listProducts(db, { q: "turmric" })).map((p) => p.id)).toEqual([turmeric.product.id, cumin.product.id]);
    expect((await listProducts(db, { q: "जीरा" })).map((p) => p.id)).toEqual([cumin.product.id]);
    expect(await listProducts(db, { q: "saffron" })).toEqual([]);

    const s = await searchSuggestions(db, "cum");
    expect(s.products.map((p) => p.name)).toEqual(["Cumin Seeds"]);
  });

  it("doesn't show draft products", async () => {
    const { product } = await makeProductWithVariant();
    await db.update(products).set({ status: "DRAFT" }).where(eq(products.id, product.id));
    expect(await listProducts(db, { q: "turmeric" })).toEqual([]);
  });
});
