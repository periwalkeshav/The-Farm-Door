import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { categories, inventoryItems, products, productVariants } from "@/db/schema";
import { applyCatalogImport, CATALOG_COLUMNS, catalogRows, planCatalogImport } from "@/server/catalog/import";
import { toCsv } from "@/server/exports";
import { db, makeItem, makeStaff, resetDb } from "./support/db";

const header = CATALOG_COLUMNS.join(",");
const row = (cells: Partial<Record<(typeof CATALOG_COLUMNS)[number], string | number>>) => CATALOG_COLUMNS.map((c) => (cells[c] === undefined ? "" : `"${String(cells[c]).replace(/"/g, '""')}"`)).join(",");
const csv = (...rows: string[]) => [header, ...rows].join("\n");

const turmeric = (size: string, sku: string, price: number, extra: Partial<Record<(typeof CATALOG_COLUMNS)[number], string | number>> = {}) =>
  row({ product: "Turmeric Powder", category: "Ground Spices", option1_name: "Size", option1_value: size, sku, price, mrp: price + 20, net_weight_g: parseInt(size), hsn: "09103030", gst_percent: 5, opening_stock: 10, ...extra });

describe("catalogue spreadsheet import", () => {
  beforeEach(async () => {
    await resetDb();
    await db.insert(categories).values({ name: "Ground Spices", slug: "ground-spices" });
  });

  it("creates products, packs, opening stock and loose-stock variants", async () => {
    const staff = await makeStaff();
    await makeItem({ name: "Cumin, loose", sku: "CUMIN-LOOSE", unit: "GRAM", onHand: 5000 });
    const plan = await planCatalogImport(
      db,
      csv(
        turmeric("100 g", "TURM-100", 65, { description: "Bright and earthy." }),
        turmeric("250 g", "turm-250", 149),
        row({ product: "Cumin", option1_name: "Form", option1_value: "Whole", option2_name: "Size", option2_value: "100 g", sku: "CUM-W-100", price: 70, mrp: 80, net_weight_g: 100, hsn: "0909", gst_percent: "5%", loose_stock_code: "cumin-loose" }),
      ),
    );
    expect(plan.errors).toEqual([]);
    expect(plan.products.map((p) => [p.handle, p.counts.created])).toEqual([
      ["turmeric-powder", 2],
      ["cumin", 1],
    ]);
    const results = await applyCatalogImport(db, plan, staff.id);
    expect(results.every((r) => r.ok)).toBe(true);

    const [p] = await db.select().from(products).where(eq(products.slug, "turmeric-powder"));
    expect(p).toMatchObject({ status: "DRAFT", description: "Bright and earthy." });
    const vs = await db.select({ v: productVariants, pool: inventoryItems }).from(productVariants).innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId)).where(eq(productVariants.productId, p.id));
    expect(vs.map((x) => [x.v.sku, x.v.pricePaise, x.v.shippingWeightGrams, x.pool.onHand])).toEqual([
      ["TURM-100", 6500, 130, 10],
      ["TURM-250", 14900, 280, 10],
    ]);
    const [cumin] = await db.select({ v: productVariants, pool: inventoryItems }).from(productVariants).innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId)).where(eq(productVariants.sku, "CUM-W-100"));
    expect(cumin).toMatchObject({ v: { unitsPerSale: 100, optionValues: { Form: "Whole", Size: "100 g" } }, pool: { sku: "CUMIN-LOOSE" } });
  });

  it("lists every problem by row and column without changing anything", async () => {
    const plan = await planCatalogImport(
      db,
      csv(
        turmeric("100 g", "TURM-100", 65, { mrp: 50 }),
        turmeric("250 g", "TURM-100", 149),
        row({ product: "Pepper", category: "Whole Spicez", sku: "PEP-1", price: "abc", mrp: 10, net_weight_g: 100, hsn: "12", gst_percent: 7 }),
      ),
    );
    const found = plan.errors.map((e) => `${e.line}:${e.column}`);
    expect(found).toEqual(expect.arrayContaining(["2:mrp", "3:sku", "4:price", "4:hsn", "4:gst_percent"]));
    expect((await db.select().from(products)).length).toBe(0);
    await expect(applyCatalogImport(db, plan, 0)).rejects.toThrow(/Fix the errors/);

    const missing = await planCatalogImport(db, "product,sku\nTurmeric,T1");
    expect(missing.errors[0].message).toMatch(/column “price” is missing/);
  });

  it("updates prices and adds packs while keeping stock and untouched details", async () => {
    const staff = await makeStaff();
    await applyCatalogImport(db, await planCatalogImport(db, csv(turmeric("100 g", "TURM-100", 65, { description: "Keep me." }), turmeric("250 g", "TURM-250", 149))), staff.id);
    const plan = await planCatalogImport(db, csv(turmeric("100 g", "TURM-100", 70, { opening_stock: 999 }), turmeric("500 g", "TURM-500", 280)));
    expect(plan.errors).toEqual([]);
    expect(plan.products[0].counts).toEqual({ created: 1, updated: 1, unchanged: 1 });
    expect(plan.warnings.join(" ")).toMatch(/opening stock is ignored/);
    await applyCatalogImport(db, plan, staff.id);

    const [p] = await db.select().from(products).where(eq(products.slug, "turmeric-powder"));
    expect(p.description).toBe("Keep me.");
    const vs = await db.select({ sku: productVariants.sku, price: productVariants.pricePaise, active: productVariants.isActive, onHand: inventoryItems.onHand }).from(productVariants).innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId)).where(eq(productVariants.productId, p.id));
    expect(vs).toEqual(
      expect.arrayContaining([
        { sku: "TURM-100", price: 7000, active: true, onHand: 10 },
        { sku: "TURM-250", price: 14900, active: true, onHand: 10 },
        { sku: "TURM-500", price: 28000, active: true, onHand: 10 },
      ]),
    );
  });

  it("re-imports its own download without changes", async () => {
    const staff = await makeStaff();
    await applyCatalogImport(db, await planCatalogImport(db, csv(turmeric("100 g", "TURM-100", 65, { description: "-dash first" }), turmeric("250 g", "TURM-250", 149))), staff.id);
    const download = toCsv({ filename: "x.csv", header: [...CATALOG_COLUMNS, "stock_now"], rows: await catalogRows(db) });
    const plan = await planCatalogImport(db, download);
    expect(plan.errors).toEqual([]);
    expect(plan.warnings).toEqual([]);
    expect(plan.products[0].counts).toEqual({ created: 0, updated: 2, unchanged: 0 });
    expect(plan.products[0].overrides.description).toBe("-dash first");
  });
});
