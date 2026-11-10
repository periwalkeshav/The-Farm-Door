/**
 * Catalogue spreadsheet import and export.
 *
 * One row per variant (pack size). Rows with the same product (or web
 * address) make one product. Importing creates new products and variants and
 * updates existing ones, matched by web address and SKU. It never deletes or
 * archives anything, and it never changes stock for existing variants: stock
 * moves only through Inventory so every change stays in the stock ledger.
 * Blank cells leave an existing product's details unchanged.
 */
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/db";
import { categories, collectionProducts, inventoryItems, products, productVariants } from "@/db/schema";
import { parseCsv } from "@/lib/csv";
import { formatWeight, paiseToRupeesString } from "@/lib/money";
import { rules } from "@/lib/validation";
import { logAudit } from "../audit";
import { CatalogError, createProduct, saveVariants, slugify, updateProductDetails, variantsPayloadSchema, type VariantsPayload } from "./admin";

export const CATALOG_COLUMNS = [
  "product",
  "web_address",
  "category",
  "status",
  "subtitle",
  "description",
  "option1_name",
  "option1_value",
  "option2_name",
  "option2_value",
  "option3_name",
  "option3_value",
  "sku",
  "price",
  "mrp",
  "net_weight_g",
  "packed_weight_g",
  "hsn",
  "gst_percent",
  "on_sale",
  "opening_stock",
  "loose_stock_code",
  "ingredients",
  "how_to_use",
  "storage",
  "shelf_life",
  "country_of_origin",
  "allergens",
  "tags",
] as const;
type Column = (typeof CATALOG_COLUMNS)[number];

const ALIASES: Record<string, Column> = {
  name: "product",
  product_name: "product",
  handle: "web_address",
  slug: "web_address",
  selling_price: "price",
  gst: "gst_percent",
  gst_rate: "gst_percent",
  hsn_code: "hsn",
  net_weight: "net_weight_g",
  packed_weight: "packed_weight_g",
  stock: "opening_stock",
};

const MAX_ROWS = 2000;
const yesNo = (v: string) => (/^(yes|y|true|1|on sale)$/i.test(v) ? true : /^(no|n|false|0)$/i.test(v) ? false : null);

const rowSchema = z
  .object({
    product: rules.requiredText("Enter the product name.", 2, 120, "The product name"),
    web_address: z
      .preprocess((v) => String(v ?? "").trim().toLowerCase(), z.string().max(80, "Keep the web address under 80 characters."))
      .refine((v) => v === "" || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v), "Use lower-case letters, numbers and single dashes, e.g. turmeric-powder."),
    category: rules.optionalText(80, "The category"),
    status: z
      .preprocess((v) => String(v ?? "").trim().toUpperCase(), z.string())
      .refine((v) => ["", "DRAFT", "ACTIVE", "ARCHIVED"].includes(v), "Status must be Draft, Active or Archived."),
    subtitle: rules.optionalText(160, "The subtitle"),
    description: rules.optionalText(5000, "The description"),
    option1_name: rules.optionalText(30, "The option name"),
    option1_value: rules.optionalText(40, "The option value"),
    option2_name: rules.optionalText(30, "The option name"),
    option2_value: rules.optionalText(40, "The option value"),
    option3_name: rules.optionalText(30, "The option name"),
    option3_value: rules.optionalText(40, "The option value"),
    sku: z.preprocess(
      (v) => String(v ?? "").trim().toUpperCase(),
      z
        .string()
        .min(1, "Enter a SKU (your own code for this pack).")
        .refine((v) => /^[A-Z0-9._-]{2,40}$/.test(v), "SKUs are 2–40 letters, numbers, dot, dash or underscore."),
    ),
    price: rules.rupees("Enter the selling price."),
    mrp: rules.rupees("Enter the MRP."),
    net_weight_g: rules.wholeNumber("the net weight in grams", 1, 100_000),
    packed_weight_g: rules.optionalWholeNumber("the packed weight in grams", 1, 100_000),
    hsn: z.preprocess((v) => String(v ?? "").replace(/\s/g, ""), z.string().refine((v) => /^\d{4,8}$/.test(v), "HSN code is 4–8 digits.")),
    gst_percent: z.preprocess(
      (v) => String(v ?? "").replace(/[%\s]/g, ""),
      z
        .string()
        .min(1, "Enter the GST rate (0, 5, 12, 18 or 28).")
        .refine((v) => ["0", "5", "12", "18", "28"].includes(v), "GST rate must be 0, 5, 12, 18 or 28.")
        .transform(Number),
    ),
    on_sale: z
      .preprocess((v) => String(v ?? "").trim(), z.string())
      .refine((v) => v === "" || yesNo(v) !== null, "Use Yes or No.")
      .transform((v) => (v === "" ? true : yesNo(v)!)),
    opening_stock: rules.optionalWholeNumber("the opening stock", 0, 100_000),
    loose_stock_code: z.preprocess((v) => String(v ?? "").trim().toUpperCase(), z.string().max(40, "That stock code is too long.")),
    ingredients: rules.optionalText(1000, "Ingredients"),
    how_to_use: rules.optionalText(2000, "How to use"),
    storage: rules.optionalText(1000, "Storage"),
    shelf_life: rules.optionalText(200, "Shelf life"),
    country_of_origin: rules.optionalText(80, "Country of origin"),
    allergens: rules.optionalText(500, "Allergens"),
    tags: rules.optionalText(500, "Tags"),
  })
  .superRefine((r, ctx) => {
    if (r.mrp < r.price) ctx.addIssue({ code: "custom", path: ["mrp"], message: "MRP can't be less than the selling price." });
    if (r.packed_weight_g !== null && r.packed_weight_g < r.net_weight_g) ctx.addIssue({ code: "custom", path: ["packed_weight_g"], message: "Packed weight can't be less than the net weight." });
    for (const n of [1, 2, 3] as const) {
      const name = r[`option${n}_name`];
      const value = r[`option${n}_value`];
      if (name && !value) ctx.addIssue({ code: "custom", path: [`option${n}_value`], message: `Enter a value for “${name}”.` });
      if (value && !name) ctx.addIssue({ code: "custom", path: [`option${n}_name`], message: "Enter the option name for this value, e.g. Size." });
    }
  });
type Row = z.output<typeof rowSchema> & { line: number };

export type RowError = { line: number; column: string; message: string };
type VariantInput = VariantsPayload["variants"][number];

export type ProductPlan = {
  handle: string;
  name: string;
  productId: number | null;
  lines: number[];
  categoryId: number | null | undefined; // undefined = leave unchanged
  overrides: Partial<Record<"subtitle" | "description" | "ingredients" | "usageInstructions" | "storageInstructions" | "shelfLife" | "countryOfOrigin" | "allergenInfo" | "tags", string>> & { status?: "DRAFT" | "ACTIVE" | "ARCHIVED" };
  payload: VariantsPayload;
  counts: { created: number; updated: number; unchanged: number };
};

export type ImportPlan = { products: ProductPlan[]; errors: RowError[]; warnings: string[]; rowCount: number };

/** Reads and checks a catalogue CSV without changing anything. */
export async function planCatalogImport(db: DbOrTx, csvText: string): Promise<ImportPlan> {
  const errors: RowError[] = [];
  const warnings: string[] = [];
  const table = parseCsv(csvText);
  if (table.length < 2) return { products: [], errors: [{ line: 1, column: "", message: "The file has no product rows. Use the template, keeping its header row." }], warnings, rowCount: 0 };

  // Map header cells to known columns.
  const header = table[0].map((h) => {
    const k = h.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/\(.*\)/, "").replace(/_+$/, "");
    return (CATALOG_COLUMNS as readonly string[]).includes(k) ? (k as Column) : (ALIASES[k] ?? null);
  });
  const unknown = table[0].filter((_, i) => header[i] === null && table[0][i].trim() && table[0][i].trim().toLowerCase() !== "stock_now");
  if (unknown.length) warnings.push(`Ignored columns: ${unknown.join(", ")}.`);
  for (const required of ["product", "sku", "price", "mrp", "net_weight_g", "hsn", "gst_percent"] as const) {
    if (!header.includes(required)) errors.push({ line: 1, column: required, message: `The column “${required}” is missing. Start from the template.` });
  }
  if (errors.length) return { products: [], errors, warnings, rowCount: 0 };
  if (table.length - 1 > MAX_ROWS) return { products: [], errors: [{ line: 1, column: "", message: `Import up to ${MAX_ROWS} rows at a time.` }], warnings, rowCount: table.length - 1 };

  const rows: Row[] = [];
  // Duplicate SKUs are checked on every row, even ones with other problems.
  const bySku = new Map<string, number>();
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const raw: Record<string, string> = {};
    header.forEach((col, j) => {
      // Our CSV downloads put an apostrophe before text starting with = + - @ (spreadsheet safety); undo that.
      if (col && raw[col] === undefined) raw[col] = (cells[j] ?? "").replace(/^'(?=[=+\-@])/, "");
    });
    const sku = (raw.sku ?? "").trim().toUpperCase();
    const firstLine = sku ? bySku.get(sku) : undefined;
    if (firstLine) errors.push({ line, column: "sku", message: `SKU ${sku} is also used on row ${firstLine}. Each pack needs its own SKU.` });
    else if (sku) bySku.set(sku, line);
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      const seen = new Set<string>();
      for (const issue of parsed.error.issues) {
        const column = String(issue.path[0] ?? "");
        if (seen.has(column) || (column === "sku" && firstLine)) continue;
        seen.add(column);
        errors.push({ line, column, message: issue.message });
      }
      return;
    }
    if (!firstLine) rows.push({ ...parsed.data, line });
  });

  // Look up categories, loose stock pools, existing products and SKUs in one go.
  const cats = await db.select({ id: categories.id, name: categories.name, slug: categories.slug }).from(categories);
  const pools = await db.select({ id: inventoryItems.id, sku: inventoryItems.sku, unit: inventoryItems.unit }).from(inventoryItems);
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const handle = r.web_address || slugify(r.product);
    groups.set(handle, [...(groups.get(handle) ?? []), r]);
  }
  const handles = [...groups.keys()];
  const existingProducts = handles.length ? await db.select().from(products).where(inArray(products.slug, handles)) : [];
  const skus = [...bySku.keys()];
  const skuOwners = skus.length ? await db.select({ sku: productVariants.sku, productId: productVariants.productId }).from(productVariants).where(inArray(productVariants.sku, skus)) : [];

  const plans: ProductPlan[] = [];
  for (const [handle, groupRows] of groups) {
    const first = groupRows[0];
    const lines = groupRows.map((r) => r.line);
    const existing = existingProducts.find((p) => p.slug === handle) ?? null;
    const fail = (line: number, column: string, message: string) => errors.push({ line, column, message });
    const before = errors.length;

    // Product name consistency.
    for (const r of groupRows) if (r.product !== first.product && !existing) fail(r.line, "product", `Rows for ${handle} use different product names (“${first.product}” on row ${first.line}).`);

    // Category (blank = none for new products, unchanged for existing ones).
    let categoryId: number | null | undefined = existing ? undefined : null;
    const catName = groupRows.find((r) => r.category)?.category;
    if (catName) {
      const match = cats.find((c) => c.name.toLowerCase() === catName.toLowerCase() || c.slug === slugify(catName));
      if (match) categoryId = match.id;
      else fail(groupRows.find((r) => r.category)!.line, "category", `There's no category called “${catName}”. Add it under Categories & collections first, or fix the spelling (${cats.map((c) => c.name).join(", ") || "none yet"}).`);
    }

    // Option names must be the same on every row of a product.
    const optionNames = [1, 2, 3].map((n) => first[`option${n}_name` as "option1_name"]).filter(Boolean);
    for (const r of groupRows) {
      const names = [1, 2, 3].map((n) => r[`option${n}_name` as "option1_name"]).filter(Boolean);
      if (names.join("|").toLowerCase() !== optionNames.join("|").toLowerCase()) fail(r.line, "option1_name", `Use the same option names on every row of ${first.product} (${optionNames.join(", ") || "none"} on row ${first.line}).`);
    }

    // Existing variants of this product.
    const current = existing
      ? await db
          .select({ v: productVariants, unit: inventoryItems.unit })
          .from(productVariants)
          .innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId))
          .where(eq(productVariants.productId, existing.id))
          .orderBy(asc(productVariants.sortOrder))
      : [];
    const usedNames = optionNames.length ? optionNames : current.length && existing!.options.length ? existing!.options.map((o) => o.name) : ["Size"];
    if (existing && current.length && optionNames.length && optionNames.join("|").toLowerCase() !== existing.options.map((o) => o.name).join("|").toLowerCase()) {
      fail(first.line, "option1_name", `${existing.name} already uses the options ${existing.options.map((o) => o.name).join(", ")}. Use the same names, or change options in the product editor.`);
    }

    const valuesOf = (r: Row): Record<string, string> =>
      optionNames.length ? Object.fromEntries(optionNames.map((n, i) => [usedNames[i], r[`option${i + 1}_value` as "option1_value"]])) : { [usedNames[0]]: formatWeight(r.net_weight_g) };

    const variants: VariantInput[] = [];
    const counts = { created: 0, updated: 0, unchanged: 0 };
    const seenCombos = new Map<string, number>();
    const fileSkus = new Set(groupRows.map((r) => r.sku));

    for (const r of groupRows) {
      const owner = skuOwners.find((o) => o.sku === r.sku);
      if (owner && owner.productId !== existing?.id) {
        fail(r.line, "sku", `SKU ${r.sku} already belongs to another product.`);
        continue;
      }
      const optionValues = valuesOf(r);
      const combo = usedNames.map((n) => optionValues[n] ?? "").join(" · ");
      const clash = seenCombos.get(combo.toLowerCase());
      if (clash) fail(r.line, "option1_value", `${first.product} already has a ${combo} pack on row ${clash}.`);
      seenCombos.set(combo.toLowerCase(), r.line);

      const match = current.find((c) => c.v.sku === r.sku);
      let stock: VariantInput["stock"];
      if (r.loose_stock_code) {
        const pool = pools.find((p) => p.sku === r.loose_stock_code);
        if (!pool || pool.unit !== "GRAM") {
          fail(r.line, "loose_stock_code", `There's no loose-stock pool with the code ${r.loose_stock_code}. Create it under Inventory first.`);
          continue;
        }
        stock = match && match.v.inventoryItemId === pool.id ? { kind: "keep" } : { kind: "bulk", inventoryItemId: pool.id };
      } else if (match) {
        stock = { kind: "keep" };
        if (r.opening_stock) warnings.push(`Row ${r.line}: opening stock is ignored for existing pack ${r.sku}. Change stock under Inventory.`);
      } else {
        stock = { kind: "new-pack", initialQty: r.opening_stock ?? 0 };
      }
      if (match) counts.updated++;
      else counts.created++;
      variants.push({
        id: match?.v.id,
        optionValues,
        sku: r.sku,
        price: paiseToRupeesString(r.price),
        mrp: paiseToRupeesString(r.mrp),
        netWeightGrams: r.net_weight_g,
        shippingWeightGrams: r.packed_weight_g ?? r.net_weight_g + 30,
        hsnCode: r.hsn,
        gstRatePercent: r.gst_percent,
        isActive: r.on_sale,
        shelfLifeOverride: match?.v.shelfLifeOverride ?? "",
        stock,
      });
    }
    // Keep existing variants that aren't in the file exactly as they are.
    for (const { v } of current) {
      if (fileSkus.has(v.sku)) continue;
      counts.unchanged++;
      const combo = usedNames.map((n) => v.optionValues[n] ?? "").join(" · ");
      const clash = seenCombos.get(combo.toLowerCase());
      if (clash && v.isActive) fail(clash, "option1_value", `${first.product} already has a ${combo} pack (SKU ${v.sku}). Use that SKU to update it.`);
      variants.push({
        id: v.id,
        optionValues: v.optionValues,
        sku: v.sku,
        price: paiseToRupeesString(v.pricePaise),
        mrp: paiseToRupeesString(v.mrpPaise),
        netWeightGrams: v.netWeightGrams,
        shippingWeightGrams: v.shippingWeightGrams,
        hsnCode: v.hsnCode,
        gstRatePercent: v.gstRateBp / 100,
        isActive: v.isActive,
        shelfLifeOverride: v.shelfLifeOverride,
        stock: { kind: "keep" },
      });
    }

    const options = usedNames.map((name) => ({ name, values: [...new Set(variants.map((v) => v.optionValues[name]).filter((x): x is string => !!x))] }));
    const payload = { options, variants };
    if (errors.length === before) {
      const check = variantsPayloadSchema.safeParse(payload);
      if (!check.success) fail(first.line, "", `${first.product}: ${check.error.issues[0].message}`);
      else if (options.some((o) => o.values.length > 20)) fail(first.line, "option1_value", `${first.product} has more than 20 values for one option.`);
    }

    const pick = (col: Column) => groupRows.find((r) => (r as Record<string, unknown>)[col])?.[col as keyof Row] as string | undefined;
    const overrides: ProductPlan["overrides"] = {};
    const fields: [keyof ProductPlan["overrides"], Column][] = [
      ["subtitle", "subtitle"],
      ["description", "description"],
      ["ingredients", "ingredients"],
      ["usageInstructions", "how_to_use"],
      ["storageInstructions", "storage"],
      ["shelfLife", "shelf_life"],
      ["countryOfOrigin", "country_of_origin"],
      ["allergenInfo", "allergens"],
      ["tags", "tags"],
    ];
    for (const [key, col] of fields) {
      const value = pick(col);
      if (value) (overrides as Record<string, string>)[key] = value;
    }
    const status = pick("status");
    if (status) overrides.status = status as "DRAFT" | "ACTIVE" | "ARCHIVED";

    plans.push({ handle, name: existing?.name ?? first.product, productId: existing?.id ?? null, lines, categoryId, overrides, payload, counts });
  }

  errors.sort((a, b) => a.line - b.line);
  return { products: plans, errors, warnings, rowCount: table.length - 1 };
}

export type ImportResult = { handle: string; name: string; productId: number | null; ok: boolean; message: string };

/** Applies a plan with no errors. Each product is saved in its own transaction; failures are reported per product. */
export async function applyCatalogImport(db: Database, plan: ImportPlan, staffUserId: number): Promise<ImportResult[]> {
  if (plan.errors.length) throw new CatalogError("Fix the errors in the file before importing.");
  const results: ImportResult[] = [];
  for (const p of plan.products) {
    let productId = p.productId;
    try {
      if (!productId) productId = (await createProduct(db, { name: p.name, categoryId: p.categoryId ?? null }, staffUserId)).id;
      await saveVariants(db, productId, p.payload, staffUserId);
      const [current] = await db.select().from(products).where(eq(products.id, productId));
      const memberships = await db.select({ id: collectionProducts.collectionId }).from(collectionProducts).where(eq(collectionProducts.productId, productId));
      const o = p.overrides;
      await updateProductDetails(
        db,
        productId,
        {
          name: current.name,
          slug: p.handle,
          subtitle: o.subtitle ?? current.subtitle,
          description: o.description ?? current.description,
          categoryId: p.categoryId === undefined ? current.categoryId : p.categoryId,
          status: o.status ?? current.status,
          tags: o.tags ?? current.tags.join(", "),
          ingredients: o.ingredients ?? current.ingredients,
          usageInstructions: o.usageInstructions ?? current.usageInstructions,
          storageInstructions: o.storageInstructions ?? current.storageInstructions,
          shelfLife: o.shelfLife ?? current.shelfLife,
          countryOfOrigin: o.countryOfOrigin ?? current.countryOfOrigin,
          // The CSV has no Hindi or "sold by" columns: keep what's there.
          netUnit: current.netUnit,
          nameHi: current.nameHi,
          subtitleHi: current.subtitleHi,
          descriptionHi: current.descriptionHi,
          ingredientsHi: current.ingredientsHi,
          usageInstructionsHi: current.usageInstructionsHi,
          storageInstructionsHi: current.storageInstructionsHi,
          allergenInfo: o.allergenInfo ?? current.allergenInfo,
          nutritionInfo: current.nutritionInfo,
          isFeatured: current.isFeatured,
          seoTitle: current.seoTitle,
          seoDescription: current.seoDescription,
          collectionIds: memberships.map((m) => m.id),
        },
        staffUserId,
      );
      const c = p.counts;
      results.push({ handle: p.handle, name: p.name, productId, ok: true, message: `${p.productId ? "Updated" : "Created"}: ${c.created} new, ${c.updated} updated pack${c.updated === 1 ? "" : "s"}.` });
    } catch (err) {
      if (!(err instanceof CatalogError)) throw err;
      results.push({ handle: p.handle, name: p.name, productId, ok: false, message: err.message });
    }
  }
  await logAudit(db, { staffUserId, action: "catalog.import", entityType: "catalog", entityId: "import", data: { products: results.length, failed: results.filter((r) => !r.ok).length } });
  return results;
}

/** Current catalogue in the import format (edit prices in a spreadsheet, then import it back). */
export async function catalogRows(db: DbOrTx): Promise<(string | number)[][]> {
  const rows = await db
    .select({ p: products, v: productVariants, category: categories.name, pool: inventoryItems })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .orderBy(asc(products.name), asc(productVariants.sortOrder));
  return rows.map(({ p, v, category, pool }) => {
    const opts = p.options.slice(0, 3);
    const opt = (i: number) => [opts[i]?.name ?? "", opts[i] ? (v.optionValues[opts[i].name] ?? "") : ""];
    const available = pool.onHand - pool.reserved;
    return [
      p.name,
      p.slug,
      category ?? "",
      p.status.toLowerCase(),
      p.subtitle,
      p.description,
      ...opt(0),
      ...opt(1),
      ...opt(2),
      v.sku,
      paiseToRupeesString(v.pricePaise),
      paiseToRupeesString(v.mrpPaise),
      v.netWeightGrams,
      v.shippingWeightGrams,
      v.hsnCode,
      v.gstRateBp / 100,
      v.isActive ? "yes" : "no",
      "",
      pool.unit === "GRAM" ? pool.sku : "",
      p.ingredients,
      p.usageInstructions,
      p.storageInstructions,
      p.shelfLife,
      p.countryOfOrigin,
      p.allergenInfo,
      p.tags.join(", "),
      pool.unit === "GRAM" ? `${(available / 1000).toFixed(3)} kg loose` : `${Math.floor(available / v.unitsPerSale)} packs`,
    ];
  });
}

export const CATALOG_EXAMPLE_ROWS: (string | number)[][] = [
  ["Turmeric Powder", "turmeric-powder", "Spices", "draft", "Haldi · ground", "Bright, earthy turmeric from Erode.", "Size", "100 g", "", "", "", "", "TURM-100", "65", "80", 100, 130, "09103030", 5, "yes", 50, "", "Turmeric", "Use in curries and dals.", "Store in a cool, dry place.", "Best before 12 months from packing", "India", "", "haldi, turmeric"],
  ["Turmeric Powder", "turmeric-powder", "Spices", "draft", "", "", "Size", "250 g", "", "", "", "", "TURM-250", "149", "180", 250, 285, "09103030", 5, "yes", 30, "", "", "", "", "", "", "", ""],
];
