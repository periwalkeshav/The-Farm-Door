/**
 * Gift boxes and combos, packed in advance. A box is a pack stock pool with a
 * recipe (what one box contains). "Assemble" moves the contents out of their
 * pools and adds boxes; "take apart" does the reverse. Every change goes
 * through the stock ledger, and selling a box works like any other pack.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db";
import { inventoryItems, kitComponents, productVariants } from "@/db/schema";
import { formatUnits } from "@/lib/units";
import { logAudit } from "./audit";
import { adjustStock } from "./inventory";

export class KitError extends Error {}

export type RecipeLine = { componentItemId: number; quantity: number };

export async function getRecipe(db: DbOrTx, kitItemId: number) {
  return db
    .select({ componentItemId: kitComponents.componentItemId, quantity: kitComponents.quantity, name: inventoryItems.name, unit: inventoryItems.unit, sku: inventoryItems.sku })
    .from(kitComponents)
    .innerJoin(inventoryItems, eq(inventoryItems.id, kitComponents.componentItemId))
    .where(eq(kitComponents.kitItemId, kitItemId))
    .orderBy(asc(kitComponents.sortOrder));
}

export async function saveRecipe(db: Database, kitItemId: number, lines: RecipeLine[], staffUserId: number) {
  const clean = lines.filter((l) => l.componentItemId && l.quantity);
  if (new Set(clean.map((l) => l.componentItemId)).size !== clean.length) throw new KitError("Each item can only appear once in the box. Change its quantity instead.");
  if (clean.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0 || l.quantity > 100_000)) throw new KitError("Quantities must be whole numbers above zero.");
  await db.transaction(async (tx) => {
    const [kit] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, kitItemId));
    if (!kit || kit.unit !== "PACK") throw new KitError("Gift boxes must be counted in packs.");
    if (clean.some((l) => l.componentItemId === kitItemId)) throw new KitError("A box can't contain itself.");
    if (clean.length) {
      const parts = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(inArray(inventoryItems.id, clean.map((l) => l.componentItemId)));
      if (parts.length !== clean.length) throw new KitError("One of the items no longer exists. Reload the page.");
      const nested = await tx.select({ id: kitComponents.kitItemId }).from(kitComponents).where(inArray(kitComponents.kitItemId, clean.map((l) => l.componentItemId))).limit(1);
      if (nested.length) throw new KitError("A box can't contain another gift box. Add that box's contents instead.");
    }
    await tx.delete(kitComponents).where(eq(kitComponents.kitItemId, kitItemId));
    if (clean.length) await tx.insert(kitComponents).values(clean.map((l, i) => ({ kitItemId, componentItemId: l.componentItemId, quantity: l.quantity, sortOrder: i })));
    await logAudit(tx, { staffUserId, action: "kit.recipe", entityType: "inventory", entityId: kitItemId, data: { components: clean.length } });
  });
}

/** Makes up `count` boxes from their contents. */
export async function assembleKits(db: Database, kitItemId: number, count: number, staffUserId: number) {
  if (!Number.isInteger(count) || count <= 0 || count > 10_000) throw new KitError("Enter how many boxes to make (a whole number).");
  return db.transaction(async (tx) => {
    const recipe = await getRecipe(tx, kitItemId);
    if (!recipe.length) throw new KitError("Add what goes in the box first.");
    const ids = [kitItemId, ...recipe.map((r) => r.componentItemId)].sort((a, b) => a - b);
    // Lock in id order, like the rest of the stock code, so this can't deadlock with checkouts.
    const pools = await tx.select().from(inventoryItems).where(inArray(inventoryItems.id, ids)).orderBy(asc(inventoryItems.id)).for("update");
    const [kit] = pools.filter((p) => p.id === kitItemId);
    const short = recipe.find((r) => {
      const p = pools.find((x) => x.id === r.componentItemId)!;
      return p.onHand - p.reserved < r.quantity * count;
    });
    if (short) {
      const p = pools.find((x) => x.id === short.componentItemId)!;
      const fits = Math.floor((p.onHand - p.reserved) / short.quantity);
      throw new KitError(`Not enough ${p.name}: ${count} boxes need ${formatUnits(short.quantity * count, p.unit)}, ${formatUnits(Math.max(0, p.onHand - p.reserved), p.unit)} available. You can make ${fits} now.`);
    }
    const note = `Made up ${count} × ${kit.name}`;
    for (const r of recipe) await adjustStock(tx, r.componentItemId, -r.quantity * count, { reason: "ASSEMBLY", staffUserId, note });
    await adjustStock(tx, kitItemId, count, { reason: "ASSEMBLY", staffUserId, note });
    await logAudit(tx, { staffUserId, action: "kit.assemble", entityType: "inventory", entityId: kitItemId, data: { count } });
    return count;
  });
}

/** Takes `count` unsold boxes apart and puts the contents back in stock. */
export async function disassembleKits(db: Database, kitItemId: number, count: number, staffUserId: number) {
  if (!Number.isInteger(count) || count <= 0 || count > 10_000) throw new KitError("Enter how many boxes to take apart (a whole number).");
  return db.transaction(async (tx) => {
    const recipe = await getRecipe(tx, kitItemId);
    if (!recipe.length) throw new KitError("This box has no contents recorded.");
    const ids = [kitItemId, ...recipe.map((r) => r.componentItemId)].sort((a, b) => a - b);
    const pools = await tx.select().from(inventoryItems).where(inArray(inventoryItems.id, ids)).orderBy(asc(inventoryItems.id)).for("update");
    const kit = pools.find((p) => p.id === kitItemId)!;
    if (kit.onHand - kit.reserved < count) throw new KitError(`Only ${kit.onHand - kit.reserved} boxes are free to take apart (others are held for orders).`);
    const note = `Took apart ${count} × ${kit.name}`;
    await adjustStock(tx, kitItemId, -count, { reason: "ASSEMBLY", staffUserId, note });
    for (const r of recipe) await adjustStock(tx, r.componentItemId, r.quantity * count, { reason: "ASSEMBLY", staffUserId, note });
    await logAudit(tx, { staffUserId, action: "kit.disassemble", entityType: "inventory", entityId: kitItemId, data: { count } });
    return count;
  });
}

/** "What's in the box" for a product's packs, keyed by variant id. */
export async function boxContentsForProduct(db: DbOrTx, productId: number) {
  const rows = await db
    .select({ variantId: productVariants.id, name: inventoryItems.name, unit: inventoryItems.unit, quantity: kitComponents.quantity })
    .from(productVariants)
    .innerJoin(kitComponents, eq(kitComponents.kitItemId, productVariants.inventoryItemId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, kitComponents.componentItemId))
    .where(and(eq(productVariants.productId, productId), eq(productVariants.isActive, true), sql`true`))
    .orderBy(asc(productVariants.sortOrder), asc(kitComponents.sortOrder));
  const out: Record<number, string[]> = {};
  for (const r of rows) (out[r.variantId] ??= []).push(r.unit === "GRAM" ? `${formatUnits(r.quantity, "GRAM")} ${r.name}` : `${r.quantity} × ${r.name}`);
  return out;
}
