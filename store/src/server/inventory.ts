/**
 * Stock control.
 *
 * Each variant draws from a stock pool (inventory item):
 *  - PACK pools count ready-packed units (1 unit per item sold);
 *  - GRAM pools hold loose stock in grams; a 250 g pack takes 250 units.
 *
 * Lifecycle for an order: reserve (hold while paying) → commit (payment
 * verified: on-hand reduced) or release (payment expired / cancelled).
 * Every change is a single conditional UPDATE, so concurrent checkouts can
 * never take more than is available. Pools are always locked in id order to
 * avoid deadlocks. Every change is written to stock_movements.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { inventoryItems, stockMovements } from "@/db/schema";

export type StockLine = { inventoryItemId: number; unitsPerSale: number; quantity: number };
export type StockNeed = { inventoryItemId: number; units: number };

export class OutOfStockError extends Error {
  constructor(
    public inventoryItemId: number,
    public available: number,
    public requested: number,
  ) {
    super(`Not enough stock for inventory item ${inventoryItemId}: ${available} available, ${requested} requested`);
  }
}

export class StockInvariantError extends Error {}

export function aggregateNeeds(lines: StockLine[]): StockNeed[] {
  const map = new Map<number, number>();
  for (const l of lines) map.set(l.inventoryItemId, (map.get(l.inventoryItemId) ?? 0) + l.unitsPerSale * l.quantity);
  return [...map.entries()].map(([inventoryItemId, units]) => ({ inventoryItemId, units })).sort((a, b) => a.inventoryItemId - b.inventoryItemId);
}

type Movement = {
  reason: (typeof stockMovements.$inferInsert)["reason"];
  orderId?: number | null;
  staffUserId?: number | null;
  note?: string;
};

async function record(tx: DbOrTx, itemId: number, changeOnHand: number, changeReserved: number, after: { onHand: number; reserved: number }, m: Movement) {
  await tx.insert(stockMovements).values({
    inventoryItemId: itemId,
    reason: m.reason,
    changeOnHand,
    changeReserved,
    onHandAfter: after.onHand,
    reservedAfter: after.reserved,
    orderId: m.orderId ?? null,
    staffUserId: m.staffUserId ?? null,
    note: m.note ?? "",
  });
}

async function available(tx: DbOrTx, itemId: number): Promise<number> {
  const [row] = await tx.select({ onHand: inventoryItems.onHand, reserved: inventoryItems.reserved, isActive: inventoryItems.isActive }).from(inventoryItems).where(eq(inventoryItems.id, itemId));
  return row && row.isActive ? row.onHand - row.reserved : 0;
}

/** Holds stock for an order. Throws OutOfStockError (and changes nothing, when used in a transaction) if any pool is short. */
export async function reserveStock(tx: DbOrTx, needs: StockNeed[], orderId: number) {
  for (const need of needs) {
    const [after] = await tx
      .update(inventoryItems)
      .set({ reserved: sql`${inventoryItems.reserved} + ${need.units}` })
      .where(and(eq(inventoryItems.id, need.inventoryItemId), eq(inventoryItems.isActive, true), sql`${inventoryItems.onHand} - ${inventoryItems.reserved} >= ${need.units}`))
      .returning({ onHand: inventoryItems.onHand, reserved: inventoryItems.reserved });
    if (!after) throw new OutOfStockError(need.inventoryItemId, await available(tx, need.inventoryItemId), need.units);
    await record(tx, need.inventoryItemId, 0, need.units, after, { reason: "RESERVE", orderId });
  }
}

/** Gives a hold back (payment expired, order cancelled before confirmation). */
export async function releaseStock(tx: DbOrTx, needs: StockNeed[], orderId: number, note = "") {
  for (const need of needs) {
    const [after] = await tx
      .update(inventoryItems)
      .set({ reserved: sql`${inventoryItems.reserved} - ${need.units}` })
      .where(and(eq(inventoryItems.id, need.inventoryItemId), sql`${inventoryItems.reserved} >= ${need.units}`))
      .returning({ onHand: inventoryItems.onHand, reserved: inventoryItems.reserved });
    if (!after) throw new StockInvariantError(`Cannot release ${need.units} from item ${need.inventoryItemId}: hold is smaller`);
    await record(tx, need.inventoryItemId, 0, -need.units, after, { reason: "RELEASE", orderId, note });
  }
}

/** Turns a hold into a sale once the order is confirmed (payment verified / COD confirmed). */
export async function commitStock(tx: DbOrTx, needs: StockNeed[], orderId: number) {
  for (const need of needs) {
    const [after] = await tx
      .update(inventoryItems)
      .set({ onHand: sql`${inventoryItems.onHand} - ${need.units}`, reserved: sql`${inventoryItems.reserved} - ${need.units}` })
      .where(and(eq(inventoryItems.id, need.inventoryItemId), sql`${inventoryItems.reserved} >= ${need.units}`))
      .returning({ onHand: inventoryItems.onHand, reserved: inventoryItems.reserved });
    if (!after) throw new StockInvariantError(`Cannot commit ${need.units} from item ${need.inventoryItemId}: hold is smaller`);
    await record(tx, need.inventoryItemId, -need.units, -need.units, after, { reason: "SALE", orderId });
  }
}

/** Puts sold stock back (cancelled after confirmation, or parcel returned in good condition). */
export async function returnStock(tx: DbOrTx, needs: StockNeed[], orderId: number, opts: { staffUserId?: number | null; note?: string } = {}) {
  for (const need of needs) {
    const [after] = await tx
      .update(inventoryItems)
      .set({ onHand: sql`${inventoryItems.onHand} + ${need.units}` })
      .where(eq(inventoryItems.id, need.inventoryItemId))
      .returning({ onHand: inventoryItems.onHand, reserved: inventoryItems.reserved });
    if (!after) throw new StockInvariantError(`Inventory item ${need.inventoryItemId} not found`);
    await record(tx, need.inventoryItemId, need.units, 0, after, { reason: "RETURN", orderId, staffUserId: opts.staffUserId, note: opts.note });
  }
}

/** Manual stock change from the admin panel (restock or correction). On-hand can't drop below what's on hold. */
export async function adjustStock(
  tx: DbOrTx,
  itemId: number,
  delta: number,
  m: { reason: "RESTOCK" | "ADJUSTMENT" | "ASSEMBLY"; staffUserId: number; note: string },
) {
  if (!Number.isInteger(delta) || delta === 0) throw new Error("Enter a whole number other than zero.");
  const [after] = await tx
    .update(inventoryItems)
    .set({ onHand: sql`${inventoryItems.onHand} + ${delta}` })
    .where(and(eq(inventoryItems.id, itemId), sql`${inventoryItems.onHand} + ${delta} >= ${inventoryItems.reserved}`))
    .returning({ onHand: inventoryItems.onHand, reserved: inventoryItems.reserved });
  if (!after) {
    throw new Error("That would leave less stock than is currently held for unpaid orders. Wait for them to complete or expire, or reduce by less.");
  }
  await record(tx, itemId, delta, 0, after, m);
  return after;
}

/** Available units (on hand minus held) per pool. Inactive pools count as 0. */
export async function availabilityFor(db: DbOrTx, itemIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (itemIds.length === 0) return out;
  const rows = await db
    .select({ id: inventoryItems.id, onHand: inventoryItems.onHand, reserved: inventoryItems.reserved, isActive: inventoryItems.isActive })
    .from(inventoryItems)
    .where(inArray(inventoryItems.id, [...new Set(itemIds)]));
  for (const r of rows) out.set(r.id, r.isActive ? r.onHand - r.reserved : 0);
  return out;
}

/** How many of a variant can be bought, given its pool's availability. */
export function sellableQuantity(availableUnits: number, unitsPerSale: number): number {
  return Math.max(0, Math.floor(availableUnits / unitsPerSale));
}
