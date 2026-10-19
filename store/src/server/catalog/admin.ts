/**
 * Catalogue management (admin). Variants are never hard-deleted once created,
 * because orders reference them; removing one from the editor archives it.
 */
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/db";
import { collectionProducts, inventoryItems, orderItems, productImages, products, productVariants } from "@/db/schema";
import { rupeesToPaise } from "@/lib/money";
import { logAudit } from "../audit";
import { adjustStock } from "../inventory";
import { variantTitle } from "./variant-title";

export class CatalogError extends Error {}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export async function uniqueSlug(db: DbOrTx, base: string, excludeId?: number) {
  const root = slugify(base) || "product";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const [hit] = await db
      .select({ id: products.id })
      .from(products)
      .where(excludeId ? and(eq(products.slug, candidate), ne(products.id, excludeId)) : eq(products.slug, candidate));
    if (!hit) return candidate;
  }
  throw new CatalogError("Couldn't find a free web address for this product.");
}

export const productDetailsSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  slug: z.string().trim().max(80).default(""),
  subtitle: z.string().trim().max(160).default(""),
  description: z.string().trim().max(5000).default(""),
  categoryId: z.coerce.number().int().positive().nullable().catch(null),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  tags: z.string().default(""),
  ingredients: z.string().trim().max(1000).default(""),
  usageInstructions: z.string().trim().max(2000).default(""),
  storageInstructions: z.string().trim().max(1000).default(""),
  shelfLife: z.string().trim().max(200).default(""),
  countryOfOrigin: z.string().trim().max(80).default("India"),
  allergenInfo: z.string().trim().max(500).default(""),
  nutritionInfo: z.string().trim().max(2000).default(""),
  isFeatured: z.boolean().default(false),
  seoTitle: z.string().trim().max(120).default(""),
  seoDescription: z.string().trim().max(300).default(""),
  collectionIds: z.array(z.coerce.number().int().positive()).default([]),
});
export type ProductDetailsInput = z.infer<typeof productDetailsSchema>;

export async function createProduct(db: Database, input: { name: string; categoryId: number | null }, staffUserId: number) {
  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, input.name);
    const [p] = await tx.insert(products).values({ name: input.name.trim(), slug, categoryId: input.categoryId, status: "DRAFT", options: [{ name: "Size", values: [] }] }).returning();
    await logAudit(tx, { staffUserId, action: "product.create", entityType: "product", entityId: p.id, data: { name: p.name } });
    return p;
  });
}

export async function updateProductDetails(db: Database, productId: number, input: ProductDetailsInput, staffUserId: number) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
    if (!current) throw new CatalogError("Product not found.");
    if (input.status === "ACTIVE") {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(productVariants).where(and(eq(productVariants.productId, productId), eq(productVariants.isActive, true)));
      if (n === 0) throw new CatalogError("Add at least one active variant (pack size) before publishing.");
    }
    const slug = input.slug ? await uniqueSlug(tx, input.slug, productId) : current.slug;
    await tx
      .update(products)
      .set({
        name: input.name,
        slug,
        subtitle: input.subtitle,
        description: input.description,
        categoryId: input.categoryId,
        status: input.status,
        tags: input.tags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 20),
        ingredients: input.ingredients,
        usageInstructions: input.usageInstructions,
        storageInstructions: input.storageInstructions,
        shelfLife: input.shelfLife,
        countryOfOrigin: input.countryOfOrigin || "India",
        allergenInfo: input.allergenInfo,
        nutritionInfo: input.nutritionInfo,
        isFeatured: input.isFeatured,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        publishedAt: input.status === "ACTIVE" && !current.publishedAt ? new Date() : current.publishedAt,
      })
      .where(eq(products.id, productId));
    await tx.delete(collectionProducts).where(eq(collectionProducts.productId, productId));
    if (input.collectionIds.length) {
      await tx.insert(collectionProducts).values([...new Set(input.collectionIds)].map((collectionId) => ({ collectionId, productId, sortOrder: 100 })));
    }
    await logAudit(tx, { staffUserId, action: "product.update", entityType: "product", entityId: productId, data: { status: input.status } });
    return { slug, previousSlug: current.slug };
  });
}

/* ---------------- Options & variants ---------------- */

const optionSchema = z.object({
  name: z.string().trim().min(1).max(30),
  values: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
});

const variantSchema = z.object({
  id: z.number().int().positive().optional(),
  optionValues: z.record(z.string(), z.string()),
  sku: z
    .string()
    .trim()
    .min(2, "Each variant needs a SKU.")
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, "SKUs may contain letters, numbers, dot, dash and underscore."),
  price: z.string(),
  mrp: z.string(),
  netWeightGrams: z.number().int().positive("Net weight must be more than 0 g.").max(100_000),
  shippingWeightGrams: z.number().int().positive("Packed weight must be more than 0 g.").max(100_000),
  hsnCode: z.string().trim().regex(/^\d{4,8}$/, "HSN code must be 4–8 digits."),
  gstRatePercent: z.number().refine((v) => [0, 5, 12, 18, 28].includes(v), "GST rate must be 0, 5, 12, 18 or 28%."),
  isActive: z.boolean(),
  shelfLifeOverride: z.string().trim().max(200).default(""),
  stock: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("keep") }),
    z.object({ kind: z.literal("new-pack"), initialQty: z.number().int().min(0).max(100_000) }),
    z.object({ kind: z.literal("bulk"), inventoryItemId: z.number().int().positive() }),
  ]),
});

export const variantsPayloadSchema = z.object({ options: z.array(optionSchema).min(1).max(3), variants: z.array(variantSchema).min(1).max(200) });
export type VariantsPayload = z.infer<typeof variantsPayloadSchema>;

export async function saveVariants(db: Database, productId: number, payload: VariantsPayload, staffUserId: number) {
  const { options, variants } = payload;
  const names = options.map((o) => o.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new CatalogError("Option names must be different.");
  for (const o of options) if (new Set(o.values.map((v) => v.toLowerCase())).size !== o.values.length) throw new CatalogError(`"${o.name}" has a repeated value.`);
  const combos = new Set<string>();
  for (const v of variants) {
    for (const o of options) if (!o.values.includes(v.optionValues[o.name] ?? "")) throw new CatalogError(`A variant is missing a value for "${o.name}".`);
    const key = options.map((o) => v.optionValues[o.name]).join("|");
    if (combos.has(key)) throw new CatalogError(`Two variants have the same options (${key.replaceAll("|", " · ")}).`);
    combos.add(key);
    const price = rupeesToPaise(v.price);
    const mrp = rupeesToPaise(v.mrp);
    if (price === null || price <= 0) throw new CatalogError(`Enter a selling price for ${key.replaceAll("|", " · ")}.`);
    if (mrp === null || mrp < price) throw new CatalogError(`MRP must be at least the selling price for ${key.replaceAll("|", " · ")}.`);
  }
  const skus = variants.map((v) => v.sku.toUpperCase());
  if (new Set(skus).size !== skus.length) throw new CatalogError("Each variant needs a different SKU.");

  return db.transaction(async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
    if (!product) throw new CatalogError("Product not found.");
    const existing = await tx.select().from(productVariants).where(eq(productVariants.productId, productId));
    const clash = await tx
      .select({ sku: productVariants.sku })
      .from(productVariants)
      .where(and(inArray(productVariants.sku, skus), ne(productVariants.productId, productId)));
    if (clash.length) throw new CatalogError(`SKU ${clash[0].sku} is already used by another product.`);

    await tx.update(products).set({ options }).where(eq(products.id, productId));

    const keepIds = new Set<number>();
    for (const [i, v] of variants.entries()) {
      const title = variantTitle(options, v.optionValues);
      let inventoryItemId: number;
      let unitsPerSale = 1;
      const current = v.id ? existing.find((e) => e.id === v.id) : undefined;
      if (v.id && !current) throw new CatalogError("A variant no longer exists; reload the page.");

      if (v.stock.kind === "bulk") {
        const [pool] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, v.stock.inventoryItemId));
        if (!pool || pool.unit !== "GRAM") throw new CatalogError("Choose a loose-stock (grams) pool for bulk variants.");
        inventoryItemId = pool.id;
        unitsPerSale = v.netWeightGrams;
      } else if (v.stock.kind === "keep" && current) {
        inventoryItemId = current.inventoryItemId;
        const [pool] = await tx.select({ unit: inventoryItems.unit }).from(inventoryItems).where(eq(inventoryItems.id, inventoryItemId));
        unitsPerSale = pool.unit === "GRAM" ? v.netWeightGrams : 1;
      } else {
        const [pool] = await tx
          .insert(inventoryItems)
          .values({ name: `${product.name} ${title}`, sku: await freePoolSku(tx, v.sku.toUpperCase()), unit: "PACK", onHand: 0, lowStockThreshold: 5 })
          .returning({ id: inventoryItems.id });
        inventoryItemId = pool.id;
        const qty = v.stock.kind === "new-pack" ? v.stock.initialQty : 0;
        if (qty > 0) await adjustStock(tx, pool.id, qty, { reason: "RESTOCK", staffUserId, note: "Opening stock" });
      }

      const values = {
        productId,
        sku: v.sku.toUpperCase(),
        optionValues: Object.fromEntries(options.map((o) => [o.name, v.optionValues[o.name]])),
        pricePaise: rupeesToPaise(v.price)!,
        mrpPaise: rupeesToPaise(v.mrp)!,
        netWeightGrams: v.netWeightGrams,
        shippingWeightGrams: v.shippingWeightGrams,
        hsnCode: v.hsnCode,
        gstRateBp: Math.round(v.gstRatePercent * 100),
        inventoryItemId,
        unitsPerSale,
        shelfLifeOverride: v.shelfLifeOverride,
        isActive: v.isActive,
        sortOrder: i,
      };
      if (current) {
        await tx.update(productVariants).set(values).where(eq(productVariants.id, current.id));
        keepIds.add(current.id);
      } else {
        const [created] = await tx.insert(productVariants).values(values).returning({ id: productVariants.id });
        keepIds.add(created.id);
      }
    }
    // Variants removed in the editor are archived, never deleted.
    const removed = existing.filter((e) => !keepIds.has(e.id)).map((e) => e.id);
    if (removed.length) await tx.update(productVariants).set({ isActive: false }).where(inArray(productVariants.id, removed));

    const [{ active }] = await tx.select({ active: sql<number>`count(*) filter (where is_active)::int` }).from(productVariants).where(eq(productVariants.productId, productId));
    if (active === 0 && product.status === "ACTIVE") await tx.update(products).set({ status: "DRAFT" }).where(eq(products.id, productId));
    await logAudit(tx, { staffUserId, action: "product.variants", entityType: "product", entityId: productId, data: { variants: variants.length, archived: removed.length } });
    return { slug: product.slug };
  });
}

async function freePoolSku(tx: DbOrTx, sku: string) {
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? sku : `${sku}-${i + 1}`;
    const [hit] = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.sku, candidate));
    if (!hit) return candidate;
  }
  return `${sku}-${Date.now()}`;
}

/** Hard-deletes a product that has never been ordered; otherwise archive it instead. */
export async function deleteProduct(db: Database, productId: number, staffUserId: number) {
  return db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(orderItems).where(eq(orderItems.productId, productId));
    if (n > 0) throw new CatalogError("This product has orders, so it can't be deleted. Set its status to Archived instead.");
    const [p] = await tx.select({ slug: products.slug, name: products.name }).from(products).where(eq(products.id, productId));
    if (!p) throw new CatalogError("Product not found.");
    const variantPools = await tx.select({ id: productVariants.inventoryItemId }).from(productVariants).where(eq(productVariants.productId, productId));
    await tx.delete(products).where(eq(products.id, productId));
    // Remove pack pools that only this product used.
    for (const { id } of variantPools) {
      const [{ users }] = await tx.select({ users: sql<number>`count(*)::int` }).from(productVariants).where(eq(productVariants.inventoryItemId, id));
      const [pool] = await tx.select({ unit: inventoryItems.unit }).from(inventoryItems).where(eq(inventoryItems.id, id));
      if (users === 0 && pool?.unit === "PACK") await tx.update(inventoryItems).set({ isActive: false }).where(eq(inventoryItems.id, id));
    }
    await logAudit(tx, { staffUserId, action: "product.delete", entityType: "product", entityId: productId, data: { name: p.name } });
    return p;
  });
}

/* ---------------- Images ---------------- */

export async function listProductImages(db: DbOrTx, productId: number) {
  return db.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder), asc(productImages.id));
}

export async function moveImage(db: Database, imageId: number, direction: -1 | 1) {
  await db.transaction(async (tx) => {
    const [img] = await tx.select().from(productImages).where(eq(productImages.id, imageId));
    if (!img) return;
    const all = await listProductImages(tx, img.productId);
    const index = all.findIndex((x) => x.id === imageId);
    const swap = all[index + direction];
    if (!swap) return;
    const order = all.map((x) => x.id);
    [order[index], order[index + direction]] = [order[index + direction], order[index]];
    for (const [i, id] of order.entries()) await tx.update(productImages).set({ sortOrder: i }).where(eq(productImages.id, id));
  });
}
