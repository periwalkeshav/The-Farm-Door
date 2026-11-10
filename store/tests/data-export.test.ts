import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { customers, addresses } from "@/db/schema";
import { customerDataExport } from "@/server/data-export";
import { db, resetDb } from "./support/db";
import { placedOrder } from "./support/orders";

describe("download my data", () => {
  beforeEach(resetDb);

  it("includes the profile, addresses and orders (also guest orders with the same email), and nothing internal", async () => {
    const placed = await placedOrder("COD", "asha@example.com");
    const [me] = await db.select().from(customers).where(eq(customers.email, "asha@example.com"));
    await db.insert(addresses).values({ customerId: me.id, name: "Asha", phone: "9876543210", line1: "4 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560001" });
    const data = await customerDataExport(db, me.id);
    expect(data?.profile.email).toBe("asha@example.com");
    expect(data?.savedAddresses).toHaveLength(1);
    expect(data?.orders.map((o) => o.orderNumber)).toEqual([placed.order.orderNumber]);
    expect(data?.orders[0].items[0]).toMatchObject({ product: "Test Turmeric", quantity: 1, price: 199 });
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/accessTokenHash|idempotencyKey|costPaise|staffNote/);
  });

  it("returns nothing for an unknown customer", async () => {
    expect(await customerDataExport(db, 999_999)).toBeNull();
  });
});
