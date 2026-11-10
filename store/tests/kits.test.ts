import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { inventoryItems, productVariants, stockMovements } from "@/db/schema";
import { assembleKits, boxContentsForProduct, disassembleKits, KitError, saveRecipe } from "@/server/kits";
import { db, makeItem, makeProductWithVariant, makeStaff, resetDb } from "./support/db";

const stock = async (id: number) => (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)))[0];

describe("gift boxes", () => {
  beforeEach(resetDb);

  async function setup() {
    const staff = await makeStaff();
    const box = await makeProductWithVariant({ onHand: 0 });
    const turmeric = await makeItem({ name: "Turmeric 100 g", onHand: 10 });
    const cumin = await makeItem({ name: "Cumin, loose", unit: "GRAM", onHand: 1000 });
    await saveRecipe(db, box.item.id, [
      { componentItemId: turmeric.id, quantity: 2 },
      { componentItemId: cumin.id, quantity: 150 },
    ], staff.id);
    return { staff, box, turmeric, cumin };
  }

  it("makes up boxes from their contents, recorded in the stock history", async () => {
    const { staff, box, turmeric, cumin } = await setup();
    await assembleKits(db, box.item.id, 4, staff.id);
    expect((await stock(box.item.id)).onHand).toBe(4);
    expect((await stock(turmeric.id)).onHand).toBe(2);
    expect((await stock(cumin.id)).onHand).toBe(400);
    const moves = await db.select().from(stockMovements).where(eq(stockMovements.reason, "ASSEMBLY"));
    expect(moves).toHaveLength(3);

    await disassembleKits(db, box.item.id, 1, staff.id);
    expect((await stock(turmeric.id)).onHand).toBe(4);
    expect((await stock(box.item.id)).onHand).toBe(3);
  });

  it("says how many boxes can be made when stock is short", async () => {
    const { staff, box } = await setup();
    await expect(assembleKits(db, box.item.id, 6, staff.id)).rejects.toThrow(/Not enough Turmeric 100 g.*You can make 5 now/);
  });

  it("won't take apart boxes held for orders", async () => {
    const { staff, box } = await setup();
    await assembleKits(db, box.item.id, 2, staff.id);
    await db.update(inventoryItems).set({ reserved: 2 }).where(eq(inventoryItems.id, box.item.id));
    await expect(disassembleKits(db, box.item.id, 1, staff.id)).rejects.toBeInstanceOf(KitError);
  });

  it("rejects boxes inside boxes, itself, and loose-stock boxes", async () => {
    const { staff, box, cumin } = await setup();
    const hamper = await makeItem({ name: "Hamper" });
    await expect(saveRecipe(db, hamper.id, [{ componentItemId: box.item.id, quantity: 1 }], staff.id)).rejects.toThrow(/another gift box/);
    await expect(saveRecipe(db, hamper.id, [{ componentItemId: hamper.id, quantity: 1 }], staff.id)).rejects.toThrow(/itself/);
    await expect(saveRecipe(db, cumin.id, [{ componentItemId: hamper.id, quantity: 1 }], staff.id)).rejects.toThrow(/counted in packs/);
  });

  it("lists what's in the box for the product page", async () => {
    const { box } = await setup();
    const contents = await boxContentsForProduct(db, box.product.id);
    const [v] = await db.select().from(productVariants).where(eq(productVariants.productId, box.product.id));
    expect(contents[v.id]).toEqual(["2 × Turmeric 100 g", "150 g Cumin, loose"]);
  });
});
