/**
 * Server-side cart. The browser only holds a random cart id in a cookie;
 * contents, prices and stock always come from the database.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { cartItems, carts, inventoryItems, productImages, products, productVariants } from "@/db/schema";
import type { PricingLine } from "@/lib/pricing";
import { variantTitle } from "./catalog/variant-title";
import { sellableQuantity } from "./inventory";
import { activeSales, priceWithSale } from "./sales";

export const MAX_QTY_PER_LINE = 20;
export const MAX_LINES = 40;

export type CartLine = {
  variantId: number;
  productId: number;
  productSlug: string;
  productName: string;
  /** Hindi name for /hi pages ("" when not filled in). Orders and invoices keep the English name. */
  productNameHi: string;
  variantTitle: string;
  sku: string;
  imageId: number | null;
  categoryId: number | null;
  /** After any running sale. */
  unitPricePaise: number;
  mrpPaise: number;
  /** Name of the sale that lowered the price, if any. */
  saleName: string | null;
  netWeightGrams: number;
  shippingWeightGrams: number;
  gstRateBp: number;
  hsnCode: string;
  inventoryItemId: number;
  unitsPerSale: number;
  unitCostPaise: number | null; // per pack (PACK pool) or per kg (GRAM pool)
  poolUnit: "PACK" | "GRAM";
  quantity: number;
  /** How many can be bought right now (after holds for other customers' unpaid orders). */
  sellable: number;
  /** False when the product/variant was archived or deactivated since it was added. */
  purchasable: boolean;
};

export type CartIssue = { variantId: number; message: string };

export async function getCartRow(db: DbOrTx, cartId: string | null | undefined) {
  if (!cartId || !/^[0-9a-f-]{36}$/i.test(cartId)) return null;
  const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
  return cart ?? null;
}

export async function createCart(db: DbOrTx, customerId: number | null) {
  const [cart] = await db.insert(carts).values({ customerId }).returning();
  return cart;
}

export async function loadCartLines(db: DbOrTx, cartId: string): Promise<CartLine[]> {
  const rows = await db
    .select({
      quantity: cartItems.quantity,
      variant: productVariants,
      product: {
        id: products.id,
        slug: products.slug,
        name: products.name,
        nameHi: products.nameHi,
        status: products.status,
        options: products.options,
        categoryId: products.categoryId,
      },
      pool: { onHand: inventoryItems.onHand, reserved: inventoryItems.reserved, isActive: inventoryItems.isActive, unit: inventoryItems.unit, unitCostPaise: inventoryItems.unitCostPaise },
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.addedAt));

  const productIds = [...new Set(rows.map((r) => r.product.id))];
  const running = rows.length ? await activeSales(db) : [];
  const images = productIds.length
    ? await db
        .select({ productId: productImages.productId, mediaId: productImages.mediaId })
        .from(productImages)
        .where(inArray(productImages.productId, productIds))
        .orderBy(asc(productImages.sortOrder))
    : [];
  const firstImage = new Map<number, number>();
  for (const img of images) if (!firstImage.has(img.productId)) firstImage.set(img.productId, img.mediaId);

  return rows.map((r) => {
    const { pricePaise, sale } = priceWithSale(r.variant.pricePaise, r.product, running);
    return {
    variantId: r.variant.id,
    productId: r.product.id,
    productSlug: r.product.slug,
    productName: r.product.name,
    productNameHi: r.product.nameHi,
    variantTitle: variantTitle(r.product.options, r.variant.optionValues),
    sku: r.variant.sku,
    imageId: firstImage.get(r.product.id) ?? null,
    categoryId: r.product.categoryId,
    unitPricePaise: pricePaise,
    mrpPaise: r.variant.mrpPaise,
    saleName: sale?.name ?? null,
    netWeightGrams: r.variant.netWeightGrams,
    shippingWeightGrams: r.variant.shippingWeightGrams,
    gstRateBp: r.variant.gstRateBp,
    hsnCode: r.variant.hsnCode,
    inventoryItemId: r.variant.inventoryItemId,
    unitsPerSale: r.variant.unitsPerSale,
    unitCostPaise: r.pool.unitCostPaise,
    poolUnit: r.pool.unit,
    quantity: r.quantity,
    sellable: r.pool.isActive ? sellableQuantity(r.pool.onHand - r.pool.reserved, r.variant.unitsPerSale) : 0,
    purchasable: r.product.status === "ACTIVE" && r.variant.isActive && r.pool.isActive,
    };
  });
}

/** Problems that block checkout. Lines sharing a bulk pool are checked together. */
export function cartIssues(lines: CartLine[]): CartIssue[] {
  const issues: CartIssue[] = [];
  const poolNeed = new Map<number, number>();
  for (const l of lines) poolNeed.set(l.inventoryItemId, (poolNeed.get(l.inventoryItemId) ?? 0) + l.unitsPerSale * l.quantity);
  for (const l of lines) {
    if (!l.purchasable) issues.push({ variantId: l.variantId, message: "No longer available. Please remove it." });
    else if (l.sellable === 0) issues.push({ variantId: l.variantId, message: "Out of stock. Please remove it." });
    else if (l.quantity > l.sellable) issues.push({ variantId: l.variantId, message: `Only ${l.sellable} left. Please reduce the quantity.` });
    else {
      const available = l.sellable * l.unitsPerSale;
      if ((poolNeed.get(l.inventoryItemId) ?? 0) > available) {
        issues.push({ variantId: l.variantId, message: "Not enough stock for all the sizes in your cart. Please reduce a quantity." });
      }
    }
  }
  return issues;
}

export function toPricingLines(lines: CartLine[]): PricingLine[] {
  return lines.map((l) => ({
    variantId: l.variantId,
    productId: l.productId,
    categoryId: l.categoryId,
    unitPricePaise: l.unitPricePaise,
    quantity: l.quantity,
    gstRateBp: l.gstRateBp,
  }));
}

export function cartWeightGrams(lines: CartLine[]) {
  return lines.reduce((sum, l) => sum + l.shippingWeightGrams * l.quantity, 0);
}

export class CartError extends Error {}

export async function addToCart(db: DbOrTx, cartId: string, variantId: number, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new CartError("Choose a quantity.");
  const [row] = await db
    .select({ variant: productVariants, status: products.status, pool: inventoryItems })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId))
    .where(eq(productVariants.id, variantId));
  if (!row || row.status !== "ACTIVE" || !row.variant.isActive) throw new CartError("This item isn't available.");
  const sellable = row.pool.isActive ? sellableQuantity(row.pool.onHand - row.pool.reserved, row.variant.unitsPerSale) : 0;
  if (sellable === 0) throw new CartError("Sorry, this is out of stock.");

  const [existing] = await db.select().from(cartItems).where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)));
  if (!existing) {
    const [{ lines }] = await db.select({ lines: sql<number>`count(*)::int` }).from(cartItems).where(eq(cartItems.cartId, cartId));
    if (lines >= MAX_LINES) throw new CartError("Your cart is full.");
  }
  const target = Math.min((existing?.quantity ?? 0) + quantity, MAX_QTY_PER_LINE, sellable);
  await db
    .insert(cartItems)
    .values({ cartId, variantId, quantity: target })
    .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.variantId], set: { quantity: target } });
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
  return { quantity: target, limited: target < (existing?.quantity ?? 0) + quantity };
}

/**
 * Adds a past order's items to a cart ("Buy again"). Items that are no longer
 * sold or are out of stock are skipped and reported by name.
 */
export async function addOrderItemsToCart(db: DbOrTx, cartId: string, items: { variantId: number | null; productName: string; variantTitle: string; quantity: number }[]) {
  let added = 0;
  let limited = false;
  const unavailable: string[] = [];
  for (const item of items) {
    const label = item.variantTitle ? `${item.productName} (${item.variantTitle})` : item.productName;
    if (!item.variantId) {
      unavailable.push(label);
      continue;
    }
    try {
      const r = await addToCart(db, cartId, item.variantId, item.quantity);
      added++;
      limited ||= r.limited;
    } catch (err) {
      if (!(err instanceof CartError)) throw err;
      unavailable.push(label);
    }
  }
  return { added, limited, unavailable };
}

export async function setCartQuantity(db: DbOrTx, cartId: string, variantId: number, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0) throw new CartError("Invalid quantity.");
  if (quantity === 0) {
    await db.delete(cartItems).where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)));
    return;
  }
  await db
    .update(cartItems)
    .set({ quantity: Math.min(quantity, MAX_QTY_PER_LINE) })
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)));
}

export async function clearCart(db: DbOrTx, cartId: string) {
  await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
  await db.update(carts).set({ couponCode: null }).where(eq(carts.id, cartId));
}

export async function cartCount(db: DbOrTx, cartId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`coalesce(sum(${cartItems.quantity}), 0)::int` }).from(cartItems).where(eq(cartItems.cartId, cartId));
  return row?.n ?? 0;
}

/** On sign-in, moves items from the guest cart into the customer's cart. */
export async function mergeIntoCustomerCart(db: DbOrTx, guestCartId: string | null, customerId: number): Promise<string> {
  const [own] = await db.select().from(carts).where(eq(carts.customerId, customerId)).orderBy(sql`${carts.updatedAt} desc`).limit(1);
  const guest = await getCartRow(db, guestCartId);
  if (!own) {
    if (guest) {
      await db.update(carts).set({ customerId }).where(eq(carts.id, guest.id));
      return guest.id;
    }
    return (await createCart(db, customerId)).id;
  }
  if (guest && guest.id !== own.id) {
    const items = await db.select().from(cartItems).where(eq(cartItems.cartId, guest.id));
    for (const item of items) {
      await db
        .insert(cartItems)
        .values({ cartId: own.id, variantId: item.variantId, quantity: item.quantity })
        .onConflictDoUpdate({
          target: [cartItems.cartId, cartItems.variantId],
          set: { quantity: sql`least(${cartItems.quantity} + ${item.quantity}, ${MAX_QTY_PER_LINE})` },
        });
    }
    if (guest.couponCode && !own.couponCode) await db.update(carts).set({ couponCode: guest.couponCode }).where(eq(carts.id, own.id));
    await db.delete(carts).where(eq(carts.id, guest.id));
  }
  return own.id;
}
