import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/db/schema";
import { addToCart, createCart, loadCartLines } from "@/server/cart";
import { listProducts } from "@/server/catalog/queries";
import { summarizeCart } from "@/server/checkout";
import { googleMerchantFeed } from "@/server/feeds";
import { saleFor, salePrice, saveSale, type Sale } from "@/server/sales";
import { db, makeProductWithVariant, makeStaff, resetDb } from "./support/db";
import { placedOrder } from "./support/orders";
import { eq } from "drizzle-orm";

const HOUR = 3600_000;

describe("sale prices", () => {
  it("rounds to whole rupees and never goes up or below ₹1", () => {
    expect(salePrice(19_900, 1000)).toBe(17_900); // ₹199 − 10% = ₹179.10 → ₹179
    expect(salePrice(24_950, 1500)).toBe(21_200); // ₹212.08 → ₹212
    expect(salePrice(150, 9000)).toBe(100);
    expect(salePrice(100, 100)).toBe(100);
  });

  it("uses the biggest of overlapping sales", () => {
    const base = { isActive: true, productIds: [] as number[], categoryIds: [] as number[], startsAt: new Date(), endsAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
    const sales: Sale[] = [
      { ...base, id: 1, name: "Shop-wide", percentOffBp: 500, scope: "ALL" },
      { ...base, id: 2, name: "Masalas", percentOffBp: 2000, scope: "CATEGORIES", categoryIds: [7] },
      { ...base, id: 3, name: "Turmeric", percentOffBp: 1000, scope: "PRODUCTS", productIds: [42] },
    ];
    expect(saleFor({ id: 42, categoryId: 7 }, sales)?.id).toBe(2);
    expect(saleFor({ id: 42, categoryId: null }, sales)?.id).toBe(3);
    expect(saleFor({ id: 1, categoryId: null }, sales)?.id).toBe(1);
  });
});

describe("scheduled sales", () => {
  beforeEach(resetDb);

  it("lowers prices on cards, in the cart, at checkout and in the order while running, and not before or after", async () => {
    const staff = await makeStaff();
    const { product, variant } = await makeProductWithVariant({ pricePaise: 20_000 });
    const now = Date.now();
    await saveSale(db, null, { name: "Upcoming", percentOffBp: 5000, scope: "ALL", productIds: [], categoryIds: [], startsAt: new Date(now + HOUR), endsAt: new Date(now + 2 * HOUR), isActive: true }, staff.id);
    await saveSale(db, null, { name: "Ended", percentOffBp: 5000, scope: "ALL", productIds: [], categoryIds: [], startsAt: new Date(now - 2 * HOUR), endsAt: new Date(now - HOUR), isActive: true }, staff.id);
    await saveSale(db, null, { name: "Paused", percentOffBp: 5000, scope: "ALL", productIds: [], categoryIds: [], startsAt: new Date(now - HOUR), endsAt: new Date(now + HOUR), isActive: false }, staff.id);
    expect((await listProducts(db, { ids: [product.id] }))[0]).toMatchObject({ pricePaise: 20_000, sale: null });

    await saveSale(db, null, { name: "Diwali sale", percentOffBp: 1500, scope: "PRODUCTS", productIds: [product.id], categoryIds: [], startsAt: new Date(now - HOUR), endsAt: new Date(now + HOUR), isActive: true }, staff.id);
    const [card] = await listProducts(db, { ids: [product.id] });
    expect(card).toMatchObject({ pricePaise: 17_000, sale: { name: "Diwali sale" } });

    const cart = await createCart(db, null);
    await addToCart(db, cart.id, variant.id, 2);
    const [line] = await loadCartLines(db, cart.id);
    expect(line).toMatchObject({ unitPricePaise: 17_000, saleName: "Diwali sale", mrpPaise: 24_900 });
    const summary = await summarizeCart(db, { cartId: cart.id, couponCode: null, pincode: "560001", paymentMethod: "COD", email: "s@example.com" });
    expect(summary.breakdown.subtotalPaise).toBe(34_000);

    const feed = await googleMerchantFeed(db, "https://example.com");
    expect(feed.body).not.toContain("<g:sale_price>"); // no photo, so the product isn't listed
  });

  it("charges the sale price on placed orders", async () => {
    const staff = await makeStaff();
    await saveSale(db, null, { name: "Festive", percentOffBp: 1000, scope: "ALL", productIds: [], categoryIds: [], startsAt: new Date(Date.now() - HOUR), endsAt: new Date(Date.now() + HOUR), isActive: true }, staff.id);
    const placed = await placedOrder("COD");
    const [order] = await db.select().from(orders).where(eq(orders.id, placed.order.id));
    expect(order.subtotalPaise).toBe(17_900); // ₹199 − 10%
  });

  it("refuses a sale that ends before it starts", async () => {
    const staff = await makeStaff();
    await expect(saveSale(db, null, { name: "Bad", percentOffBp: 1000, scope: "ALL", productIds: [], categoryIds: [], startsAt: new Date(), endsAt: new Date(Date.now() - 1), isActive: true }, staff.id)).rejects.toThrow(/end after/);
  });
});
