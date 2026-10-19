import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { inventoryItems, products, productVariants } from "@/db/schema";

export const db = getDb();

/** Empties every table (test database only). */
export async function resetDb() {
  if (!process.env.DATABASE_URL?.includes("_test")) throw new Error("Refusing to reset a non-test database");
  const { rows } = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`truncate ${names} restart identity cascade`));
}

export async function makeItem(over: Partial<typeof inventoryItems.$inferInsert> = {}) {
  const [item] = await db
    .insert(inventoryItems)
    .values({ name: "Test pool", sku: `POOL-${Math.random().toString(36).slice(2, 8)}`, unit: "PACK", onHand: 10, ...over })
    .returning();
  return item;
}

export async function makeProductWithVariant(opts: { pricePaise?: number; onHand?: number; unit?: "PACK" | "GRAM"; netWeightGrams?: number } = {}) {
  const item = await makeItem({ unit: opts.unit ?? "PACK", onHand: opts.onHand ?? 10 });
  const [product] = await db
    .insert(products)
    .values({ slug: `p-${Math.random().toString(36).slice(2, 8)}`, name: "Test Turmeric", status: "ACTIVE", options: [{ name: "Size", values: ["250 g"] }] })
    .returning();
  const net = opts.netWeightGrams ?? 250;
  const [variant] = await db
    .insert(productVariants)
    .values({
      productId: product.id,
      sku: `SKU-${Math.random().toString(36).slice(2, 8)}`,
      optionValues: { Size: "250 g" },
      pricePaise: opts.pricePaise ?? 19_900,
      mrpPaise: 24_900,
      netWeightGrams: net,
      shippingWeightGrams: net + 30,
      hsnCode: "09103030",
      gstRateBp: 500,
      inventoryItemId: item.id,
      unitsPerSale: (opts.unit ?? "PACK") === "GRAM" ? net : 1,
    })
    .returning();
  return { item, product, variant };
}

export async function makeStaff(role: "OWNER" | "MANAGER" | "PACKER" | "ACCOUNTANT" = "OWNER") {
  const { staffUsers } = await import("@/db/schema");
  const [staff] = await db
    .insert(staffUsers)
    .values({ email: `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}@example.com`, name: "Test Staff", passwordHash: "x", role, totpEnabled: true })
    .returning();
  return staff;
}
