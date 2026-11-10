/**
 * Scheduled sales: a percentage off selling prices between two dates and
 * times (IST), for the whole shop, some categories or some products.
 *
 * The sale price is worked out on the server wherever a price is used:
 * product cards and pages, the cart, checkout and the order itself, and the
 * Google Shopping feed. When sales overlap, the bigger discount wins; they
 * never stack with each other (coupons and points still apply on top).
 * Sale prices are rounded to whole rupees and are never above the normal
 * price, so never above MRP.
 *
 * Shop pages are cached for a minute or two, so a sale shows up (or
 * disappears) within a couple of minutes of its start or end. Checkout always
 * uses the exact price at that moment.
 */
import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { sales } from "@/db/schema";
import { logAudit } from "./audit";

export type Sale = typeof sales.$inferSelect;
export type SaleTag = { id: number; name: string; endsAt: Date; percentOffBp: number };

export class SaleError extends Error {}

export async function activeSales(db: DbOrTx, now = new Date()): Promise<Sale[]> {
  return db
    .select()
    .from(sales)
    .where(and(eq(sales.isActive, true), lte(sales.startsAt, now), gt(sales.endsAt, now)))
    .orderBy(desc(sales.percentOffBp));
}

/** The biggest sale that covers this product, if any. */
export function saleFor(product: { id: number; categoryId: number | null }, active: Sale[]): Sale | null {
  return (
    active
      .filter((s) => s.scope === "ALL" || (s.scope === "PRODUCTS" && s.productIds.includes(product.id)) || (s.scope === "CATEGORIES" && product.categoryId !== null && s.categoryIds.includes(product.categoryId)))
      .sort((a, b) => b.percentOffBp - a.percentOffBp)[0] ?? null
  );
}

/** Price after the sale's discount, rounded to whole rupees, never above the normal price nor below ₹1. */
export function salePrice(pricePaise: number, percentOffBp: number): number {
  const discounted = Math.round((pricePaise * (10_000 - percentOffBp)) / 10_000 / 100) * 100;
  return Math.min(pricePaise, Math.max(100, discounted));
}

/** Applies the best active sale to a price. */
export function priceWithSale(pricePaise: number, product: { id: number; categoryId: number | null }, active: Sale[]): { pricePaise: number; sale: SaleTag | null } {
  const sale = saleFor(product, active);
  if (!sale) return { pricePaise, sale: null };
  const price = salePrice(pricePaise, sale.percentOffBp);
  return price < pricePaise ? { pricePaise: price, sale: { id: sale.id, name: sale.name, endsAt: sale.endsAt, percentOffBp: sale.percentOffBp } } : { pricePaise, sale: null };
}

/* ---------------- Admin ---------------- */

export async function listSales(db: DbOrTx) {
  return db.select().from(sales).orderBy(desc(sales.isActive), asc(sales.startsAt));
}

export type SaleInput = { name: string; percentOffBp: number; scope: "ALL" | "PRODUCTS" | "CATEGORIES"; productIds: number[]; categoryIds: number[]; startsAt: Date; endsAt: Date; isActive: boolean };

export async function saveSale(db: DbOrTx, id: number | null, input: SaleInput, staffUserId: number) {
  if (input.endsAt <= input.startsAt) throw new SaleError("The sale must end after it starts.");
  if (input.percentOffBp < 100 || input.percentOffBp > 9000) throw new SaleError("Choose between 1% and 90% off.");
  const values = { ...input, productIds: input.scope === "PRODUCTS" ? input.productIds : [], categoryIds: input.scope === "CATEGORIES" ? input.categoryIds : [] };
  let saleId = id;
  if (id) {
    const [row] = await db.update(sales).set(values).where(eq(sales.id, id)).returning({ id: sales.id });
    if (!row) throw new SaleError("Sale not found.");
  } else {
    saleId = (await db.insert(sales).values(values).returning({ id: sales.id }))[0].id;
  }
  await logAudit(db, { staffUserId, action: id ? "sale.update" : "sale.create", entityType: "sale", entityId: saleId!, data: { name: input.name, percentOffBp: input.percentOffBp } });
  return saleId!;
}

/** Ends a running sale now (or cancels an upcoming one). */
export async function endSale(db: DbOrTx, id: number, staffUserId: number) {
  await db.update(sales).set({ isActive: false }).where(eq(sales.id, id));
  await logAudit(db, { staffUserId, action: "sale.end", entityType: "sale", entityId: id });
}
