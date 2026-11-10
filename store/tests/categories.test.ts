import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { categories, collectionProducts, collections, products } from "@/db/schema";
import { formatQuantity, pricePer100 } from "@/lib/money";
import { categoryGroups, listCategories, listProducts } from "@/server/catalog/queries";
import { DEFAULT_CATEGORIES, ensureDefaultCategories } from "../scripts/categories";
import { db, makeProductWithVariant, resetDb } from "./support/db";

describe("categories", () => {
  beforeEach(resetDb);

  it("creates the default categories and the filters inside Spices once, with Hindi names", async () => {
    expect(await ensureDefaultCategories(db)).toBe(DEFAULT_CATEGORIES.length + 3);
    expect(await ensureDefaultCategories(db)).toBe(0);
    const rows = await db.select().from(categories);
    expect(rows.map((c) => c.slug)).toEqual(["spices", "oils", "pulses", "grains", "honey", "dry-fruits", "others"]);
    expect(rows.every((c) => c.nameHi)).toBe(true);
    const spices = rows.find((c) => c.slug === "spices")!;
    expect((await categoryGroups(db, spices.id)).map((g) => g.slug)).toEqual(["whole-spices", "ground-spices", "masala-blends"]);
  });

  it("shows a category to shoppers only once it has a product on sale", async () => {
    await ensureDefaultCategories(db);
    expect(await listCategories(db)).toEqual([]);
    const { product } = await makeProductWithVariant();
    const [oils] = await db.select().from(categories).where(eq(categories.slug, "oils"));
    await db.update(products).set({ categoryId: oils.id }).where(eq(products.id, product.id));
    expect((await listCategories(db, "hi")).map((c) => c.name)).toEqual(["तेल"]);
    await db.update(products).set({ status: "DRAFT" }).where(eq(products.id, product.id));
    expect(await listCategories(db)).toEqual([]);
  });

  it("collections set inside a category filter that category's page", async () => {
    await ensureDefaultCategories(db);
    const [spices] = await db.select().from(categories).where(eq(categories.slug, "spices"));
    const whole = await makeProductWithVariant();
    const ground = await makeProductWithVariant();
    await db.update(products).set({ categoryId: spices.id });
    const [group] = await db.select().from(collections).where(eq(collections.slug, "whole-spices"));
    await db.insert(collections).values({ slug: "bestsellers", name: "Bestsellers" });
    await db.insert(collectionProducts).values({ collectionId: group.id, productId: whole.product.id });

    expect((await categoryGroups(db, spices.id))[0]).toEqual({ slug: "whole-spices", name: "Whole spices" });
    expect((await categoryGroups(db, spices.id, "hi"))[0]).toEqual({ slug: "whole-spices", name: "साबुत मसाले" });
    expect((await listProducts(db, { categorySlug: "spices" })).map((p) => p.id).sort()).toEqual([whole.product.id, ground.product.id].sort());
    expect((await listProducts(db, { categorySlug: "spices", collectionSlug: "whole-spices" })).map((p) => p.id)).toEqual([whole.product.id]);
  });
});

describe("pack quantities", () => {
  it("shows weights and volumes, and prices per 100 g or 100 ml", () => {
    expect(formatQuantity(250, "g")).toBe("250 g");
    expect(formatQuantity(1500, "g")).toBe("1.5 kg");
    expect(formatQuantity(500, "ml")).toBe("500 ml");
    expect(formatQuantity(1000, "ml")).toBe("1 L");
    expect(formatQuantity(5000, "ml")).toBe("5 L");
    expect(pricePer100(26_000, 1000)).toBe(2600);
  });
});
