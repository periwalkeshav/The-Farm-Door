/** Saved-for-later products for signed-in customers. */
import { and, desc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { inventoryItems, productImages, products, productVariants, wishlistItems } from "@/db/schema";

export async function isSaved(db: DbOrTx, customerId: number, productId: number) {
  const [row] = await db.select({ p: wishlistItems.productId }).from(wishlistItems).where(and(eq(wishlistItems.customerId, customerId), eq(wishlistItems.productId, productId)));
  return !!row;
}

/** Saves or un-saves a product; returns whether it's saved now. */
export async function toggleSaved(db: DbOrTx, customerId: number, productId: number) {
  const removed = await db.delete(wishlistItems).where(and(eq(wishlistItems.customerId, customerId), eq(wishlistItems.productId, productId))).returning();
  if (removed.length) return false;
  const [p] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
  if (!p) return false;
  await db.insert(wishlistItems).values({ customerId, productId }).onConflictDoNothing();
  return true;
}

export async function savedProducts(db: DbOrTx, customerId: number) {
  return db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      status: products.status,
      minPrice: sql<number | null>`(select min(v.price_paise) from ${productVariants} v where v.product_id = ${products.id} and v.is_active)`,
      inStock: sql<boolean>`exists (select 1 from ${productVariants} v join ${inventoryItems} i on i.id = v.inventory_item_id where v.product_id = ${products.id} and v.is_active and i.is_active and (i.on_hand - i.reserved) >= v.units_per_sale)`,
      image: sql<number | null>`(select media_id from ${productImages} pi where pi.product_id = ${products.id} order by sort_order, id limit 1)`,
    })
    .from(wishlistItems)
    .innerJoin(products, eq(products.id, wishlistItems.productId))
    .where(eq(wishlistItems.customerId, customerId))
    .orderBy(desc(wishlistItems.createdAt));
}
