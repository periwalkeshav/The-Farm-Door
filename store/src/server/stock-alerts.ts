/**
 * "Email me when it's back": customers leave their email on a sold-out pack and
 * get one email when it can be bought again. Checked by the scheduled job.
 */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db";
import { emailOptOuts, inventoryItems, products, productVariants, stockAlerts } from "@/db/schema";
import { env } from "@/lib/env";
import { normalizeEmail } from "@/lib/india";
import { variantTitle } from "./catalog/variant-title";
import { sendEmail } from "./email/send";
import { backInStockEmail } from "./email/templates";

export class StockAlertError extends Error {}

const sellable = sql`(${inventoryItems.onHand} - ${inventoryItems.reserved}) >= ${productVariants.unitsPerSale}`;

export async function subscribeStockAlert(db: DbOrTx, variantId: number, rawEmail: string) {
  const [row] = await db
    .select({ variant: productVariants, status: products.status, available: sql<boolean>`${sellable} and ${inventoryItems.isActive}` })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId))
    .where(eq(productVariants.id, variantId));
  if (!row || row.status !== "ACTIVE" || !row.variant.isActive) throw new StockAlertError("This item isn't sold any more.");
  if (row.available) throw new StockAlertError("Good news: it's in stock right now. Add it to your cart.");
  const email = normalizeEmail(rawEmail);
  await db
    .insert(stockAlerts)
    .values({ variantId, email })
    .onConflictDoUpdate({ target: [stockAlerts.variantId, stockAlerts.email], set: { notifiedAt: null, createdAt: new Date() } });
}

/** Sends the emails for packs that are buyable again. */
export async function sendBackInStockAlerts(db: Database) {
  const due = await db
    .select({ alert: stockAlerts, product: products, variant: productVariants })
    .from(stockAlerts)
    .innerJoin(productVariants, eq(productVariants.id, stockAlerts.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId))
    .where(and(isNull(stockAlerts.notifiedAt), eq(products.status, "ACTIVE"), eq(productVariants.isActive, true), eq(inventoryItems.isActive, true), sellable))
    .orderBy(asc(stockAlerts.createdAt))
    .limit(200);
  let sent = 0;
  for (const { alert, product, variant } of due) {
    const [claimed] = await db
      .update(stockAlerts)
      .set({ notifiedAt: new Date() })
      .where(and(eq(stockAlerts.id, alert.id), isNull(stockAlerts.notifiedAt)))
      .returning({ id: stockAlerts.id });
    if (!claimed) continue;
    const [optedOut] = await db.select({ email: emailOptOuts.email }).from(emailOptOuts).where(eq(emailOptOuts.email, alert.email));
    if (optedOut) continue;
    await sendEmail(db, { to: alert.email, ...backInStockEmail(product.name, variantTitle(product.options, variant.optionValues), `${env().APP_URL}/products/${product.slug}`), template: "back-in-stock" });
    sent++;
  }
  return sent;
}

/** Packs customers are waiting for, most-wanted first (for the admin dashboard). */
export async function waitingForRestock(db: DbOrTx, limit = 8) {
  return db
    .select({ productId: products.id, productName: products.name, options: products.options, optionValues: productVariants.optionValues, waiting: sql<number>`count(*)::int` })
    .from(stockAlerts)
    .innerJoin(productVariants, eq(productVariants.id, stockAlerts.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(isNull(stockAlerts.notifiedAt))
    .groupBy(products.id, products.name, products.options, productVariants.id, productVariants.optionValues)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
}
