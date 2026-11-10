import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { customers, media, productImages, products } from "@/db/schema";
import { googleMerchantFeed } from "@/server/feeds";
import { savedProducts, toggleSaved } from "@/server/wishlist";
import { db, makeProductWithVariant, resetDb } from "./support/db";

async function addImage(productId: number) {
  const [m] = await db.insert(media).values({ sha256: `sha-${productId}-${Math.random()}`, mime: "image/webp", width: 10, height: 10, full: Buffer.from("x"), thumb: Buffer.from("x") }).returning();
  await db.insert(productImages).values({ productId, mediaId: m.id, alt: "", sortOrder: 0 });
}

describe("wishlist", () => {
  beforeEach(resetDb);

  it("saves and un-saves products", async () => {
    const { product } = await makeProductWithVariant();
    const [c] = await db.insert(customers).values({ email: "w@example.com" }).returning();
    expect(await toggleSaved(db, c.id, product.id)).toBe(true);
    expect((await savedProducts(db, c.id)).map((p) => [p.name, p.inStock])).toEqual([["Test Turmeric", true]]);
    expect(await toggleSaved(db, c.id, product.id)).toBe(false);
    expect(await savedProducts(db, c.id)).toEqual([]);
  });
});

describe("Google Shopping feed", () => {
  beforeEach(resetDb);

  it("lists packs with photos, sale prices and stock, escaping text", async () => {
    const withPhoto = await makeProductWithVariant({ pricePaise: 19_900 });
    await db.update(products).set({ name: "Salt & Pepper <Mix>" }).where(eq(products.id, withPhoto.product.id));
    await addImage(withPhoto.product.id);
    const soldOut = await makeProductWithVariant({ onHand: 0 });
    await addImage(soldOut.product.id);
    await makeProductWithVariant(); // no photo: left out

    const feed = await googleMerchantFeed(db, "https://thefarmdoor.com");
    expect(feed).toMatchObject({ listed: 2, skipped: 1 });
    expect(feed.body).toContain("<title>Salt &amp; Pepper &lt;Mix&gt; – 250 g</title>");
    expect(feed.body).toContain("<g:price>249.00 INR</g:price><g:sale_price>199.00 INR</g:sale_price>");
    expect(feed.body).toContain(`<link>https://thefarmdoor.com/products/${withPhoto.product.slug}?pack=${withPhoto.variant.id}</link>`);
    expect(feed.body).toContain("<g:availability>out_of_stock</g:availability>");
  });
});
