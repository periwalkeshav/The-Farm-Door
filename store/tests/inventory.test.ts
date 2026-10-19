import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { inventoryItems, stockMovements } from "@/db/schema";
import { adjustStock, aggregateNeeds, commitStock, OutOfStockError, releaseStock, reserveStock, returnStock } from "@/server/inventory";
import { db, makeItem, resetDb } from "./support/db";

async function item(id: number) {
  const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
  return row;
}

describe("inventory", () => {
  beforeEach(resetDb);

  it("aggregates pack and bulk needs per pool", () => {
    expect(
      aggregateNeeds([
        { inventoryItemId: 2, unitsPerSale: 250, quantity: 2 },
        { inventoryItemId: 1, unitsPerSale: 1, quantity: 3 },
        { inventoryItemId: 2, unitsPerSale: 100, quantity: 1 },
      ]),
    ).toEqual([
      { inventoryItemId: 1, units: 3 },
      { inventoryItemId: 2, units: 600 },
    ]);
  });

  it("reserves, then commits on confirmation", async () => {
    const pool = await makeItem({ onHand: 10 });
    await db.transaction((tx) => reserveStock(tx, [{ inventoryItemId: pool.id, units: 3 }], 1));
    expect(await item(pool.id)).toMatchObject({ onHand: 10, reserved: 3 });
    await db.transaction((tx) => commitStock(tx, [{ inventoryItemId: pool.id, units: 3 }], 1));
    expect(await item(pool.id)).toMatchObject({ onHand: 7, reserved: 0 });
    const moves = await db.select().from(stockMovements).where(eq(stockMovements.inventoryItemId, pool.id));
    expect(moves.map((m) => m.reason)).toEqual(["RESERVE", "SALE"]);
  });

  it("releases a hold when payment expires", async () => {
    const pool = await makeItem({ onHand: 5 });
    await db.transaction((tx) => reserveStock(tx, [{ inventoryItemId: pool.id, units: 5 }], 1));
    await db.transaction((tx) => releaseStock(tx, [{ inventoryItemId: pool.id, units: 5 }], 1));
    expect(await item(pool.id)).toMatchObject({ onHand: 5, reserved: 0 });
  });

  it("refuses to oversell and rolls back the whole order", async () => {
    const a = await makeItem({ onHand: 5 });
    const b = await makeItem({ onHand: 1 });
    await expect(
      db.transaction((tx) =>
        reserveStock(
          tx,
          [
            { inventoryItemId: a.id, units: 2 },
            { inventoryItemId: b.id, units: 2 },
          ],
          1,
        ),
      ),
    ).rejects.toBeInstanceOf(OutOfStockError);
    expect(await item(a.id)).toMatchObject({ reserved: 0 });
    expect(await item(b.id)).toMatchObject({ reserved: 0 });
  });

  it("never oversells under concurrent checkouts", async () => {
    const pool = await makeItem({ onHand: 10 });
    const attempts = await Promise.allSettled(
      Array.from({ length: 25 }, (_, i) => db.transaction((tx) => reserveStock(tx, [{ inventoryItemId: pool.id, units: 1 }], i + 1))),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(10);
    expect(await item(pool.id)).toMatchObject({ onHand: 10, reserved: 10 });
  });

  it("bulk pools share grams across pack sizes", async () => {
    const pool = await makeItem({ unit: "GRAM", onHand: 1000 });
    const needs = aggregateNeeds([
      { inventoryItemId: pool.id, unitsPerSale: 250, quantity: 2 },
      { inventoryItemId: pool.id, unitsPerSale: 500, quantity: 1 },
    ]);
    await db.transaction((tx) => reserveStock(tx, needs, 1));
    await expect(db.transaction((tx) => reserveStock(tx, [{ inventoryItemId: pool.id, units: 100 }], 2))).rejects.toBeInstanceOf(OutOfStockError);
  });

  it("won't let a manual reduction go below stock on hold", async () => {
    const pool = await makeItem({ onHand: 10 });
    await db.transaction((tx) => reserveStock(tx, [{ inventoryItemId: pool.id, units: 8 }], 1));
    await expect(db.transaction((tx) => adjustStock(tx, pool.id, -5, { reason: "ADJUSTMENT", staffUserId: 1, note: "damaged" }))).rejects.toThrow();
    await db.transaction((tx) => adjustStock(tx, pool.id, -2, { reason: "ADJUSTMENT", staffUserId: 1, note: "damaged" }));
    expect(await item(pool.id)).toMatchObject({ onHand: 8, reserved: 8 });
  });

  it("returns stock after a cancellation", async () => {
    const pool = await makeItem({ onHand: 4 });
    await db.transaction(async (tx) => {
      await reserveStock(tx, [{ inventoryItemId: pool.id, units: 4 }], 1);
      await commitStock(tx, [{ inventoryItemId: pool.id, units: 4 }], 1);
      await returnStock(tx, [{ inventoryItemId: pool.id, units: 4 }], 1, { note: "cancelled before dispatch" });
    });
    expect(await item(pool.id)).toMatchObject({ onHand: 4, reserved: 0 });
  });
});
