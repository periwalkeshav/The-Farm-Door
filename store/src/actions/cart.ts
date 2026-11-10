"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { carts, inventoryItems, orderItems, orders, productVariants } from "@/db/schema";
import { cookieName, cookieOptions } from "@/data/cookies";
import { clientIp } from "@/data/request";
import { getCustomer } from "@/data/session";
import { isValidPincode } from "@/lib/india";
import { addOrderItemsToCart, addToCart, CartError, cartCount, createCart, getCartRow, setCartQuantity } from "@/server/cart";
import { checkCoupon } from "@/server/coupons";
import { loadCartLines, toPricingLines } from "@/server/cart";
import { checkOrderToken } from "@/server/orders/common";
import { stockAlertSchema } from "@/lib/form-schemas";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/validation";
import { hitRateLimit } from "@/server/rate-limit";
import { StockAlertError, subscribeStockAlert } from "@/server/stock-alerts";
import { readSettings } from "@/server/settings";
import { parcelWeight, quoteShipping } from "@/server/shipping";

const CART_MAX_AGE = 60 * 24 * 60 * 60;

async function ensureCartId(): Promise<string> {
  const db = getDb();
  const jar = await cookies();
  const existing = await getCartRow(db, jar.get(cookieName("cart"))?.value);
  if (existing) return existing.id;
  const customer = await getCustomer();
  const cart = await createCart(db, customer?.id ?? null);
  jar.set(cookieName("cart"), cart.id, cookieOptions({ maxAgeSeconds: CART_MAX_AGE }));
  return cart.id;
}

async function currentCartId(): Promise<string | null> {
  const cart = await getCartRow(getDb(), (await cookies()).get(cookieName("cart"))?.value);
  return cart?.id ?? null;
}

export type AddToCartState = { ok: boolean; message: string; count?: number } | null;

const addSchema = z.object({ variantId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(20) });

export async function addToCartAction(_prev: AddToCartState, formData: FormData): Promise<AddToCartState> {
  const parsed = addSchema.safeParse({ variantId: formData.get("variantId"), quantity: formData.get("quantity") ?? 1 });
  if (!parsed.success) return { ok: false, message: "Please choose an option." };
  const db = getDb();
  const ip = await clientIp();
  if (!(await hitRateLimit(db, `cart:${ip}`, 120, 600)).allowed) return { ok: false, message: "Too many requests. Please wait a moment." };
  try {
    const cartId = await ensureCartId();
    const r = await addToCart(db, cartId, parsed.data.variantId, parsed.data.quantity);
    const count = await cartCount(db, cartId);
    refresh();
    return { ok: true, message: r.limited ? `Added. We could only add up to ${r.quantity} in total.` : "Added to your cart.", count };
  } catch (err) {
    if (err instanceof CartError) return { ok: false, message: err.message };
    throw err;
  }
}

export type AddManyState = { ok: boolean; message: string; count?: number; added: number; failed: string[] };

/** "Add all to cart" for a bundle: one of each pack. Items that can't be added are reported, the rest still go in. */
export async function addManyToCartAction(variantIds: number[]): Promise<AddManyState> {
  const ids = z.array(z.number().int().positive()).min(1).max(6).safeParse([...new Set(variantIds)]);
  if (!ids.success) return { ok: false, message: "Choose at least one item.", added: 0, failed: [] };
  const db = getDb();
  if (!(await hitRateLimit(db, `cart:${await clientIp()}`, 120, 600)).allowed) return { ok: false, message: "Too many requests. Please wait a moment.", added: 0, failed: [] };
  const cartId = await ensureCartId();
  let added = 0;
  const failed: string[] = [];
  for (const id of ids.data) {
    try {
      await addToCart(db, cartId, id, 1);
      added++;
    } catch (err) {
      if (!(err instanceof CartError)) throw err;
      failed.push(err.message);
    }
  }
  const count = await cartCount(db, cartId);
  refresh();
  return { ok: added > 0, message: added ? `${added} item${added === 1 ? "" : "s"} added to your cart` : (failed[0] ?? "Couldn't add those items."), count, added, failed };
}

export async function updateQuantityAction(variantId: number, quantity: number) {
  const cartId = await currentCartId();
  if (!cartId || !Number.isInteger(variantId) || !Number.isInteger(quantity) || quantity < 0 || quantity > 20) return;
  await setCartQuantity(getDb(), cartId, variantId, quantity);
  refresh();
}

export type CouponState = { ok: boolean; message: string } | null;

export async function applyCouponAction(_prev: CouponState, formData: FormData): Promise<CouponState> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase().slice(0, 40);
  const db = getDb();
  if (!(await hitRateLimit(db, `coupon:${await clientIp()}`, 30, 600)).allowed) return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  const cartId = await currentCartId();
  if (!cartId) return { ok: false, message: "Your cart is empty." };
  if (!code) {
    await db.update(carts).set({ couponCode: null }).where(eq(carts.id, cartId));
    refresh();
    return { ok: true, message: "Code removed." };
  }
  const lines = await loadCartLines(db, cartId);
  const customer = await getCustomer();
  const check = await checkCoupon(db, code, toPricingLines(lines), customer?.email ?? null);
  if (!check.ok) return { ok: false, message: check.reason };
  await db.update(carts).set({ couponCode: code }).where(eq(carts.id, cartId));
  refresh();
  return { ok: true, message: check.result.freeShipping ? "Free shipping applied." : "Code applied." };
}

export async function removeCouponAction() {
  const cartId = await currentCartId();
  if (cartId) await getDb().update(carts).set({ couponCode: null }).where(eq(carts.id, cartId));
  refresh();
}

export async function setCartPincodeAction(pincode: string) {
  const cartId = await currentCartId();
  if (!cartId) return;
  const value = pincode.trim();
  await getDb()
    .update(carts)
    .set({ pincode: isValidPincode(value) ? value : null })
    .where(eq(carts.id, cartId));
  refresh();
}

export type PincodeCheck =
  | { status: "OK"; etaDate: string | null; etaDays: number | null; shippingPaise: number; courier: string; simulated: boolean }
  | { status: "UNSERVICEABLE" | "INVALID" | "ERROR" | "LIMIT"; message: string };

/** Product page: can we deliver this item to the pincode, when, and what would shipping cost for one unit? */
export async function checkPincodeAction(pincode: string, variantId: number): Promise<PincodeCheck> {
  const value = pincode.trim();
  if (!isValidPincode(value)) return { status: "INVALID", message: "Enter a valid 6-digit pincode." };
  const db = getDb();
  if (!(await hitRateLimit(db, `pincode:${await clientIp()}`, 40, 600)).allowed) return { status: "LIMIT", message: "Too many checks. Please wait a few minutes." };
  const [variant] = await db
    .select({ weight: productVariants.shippingWeightGrams, price: productVariants.pricePaise, active: inventoryItems.isActive })
    .from(productVariants)
    .innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId))
    .where(eq(productVariants.id, variantId));
  if (!variant) return { status: "ERROR", message: "Please choose an option first." };
  const shipping = await readSettings(db, "shipping");
  const quote = await quoteShipping({ deliveryPincode: value, weightGrams: parcelWeight(variant.weight, shipping), cod: false, declaredValuePaise: variant.price, shipping });
  if (quote.status === "OK") {
    const charge = Math.ceil((quote.courier.costPaise + shipping.handlingFeePaise) / 100) * 100;
    return { status: "OK", etaDate: quote.courier.etaDate, etaDays: quote.courier.etaDays, shippingPaise: charge, courier: quote.courier.name, simulated: quote.provider === "mock" };
  }
  if (quote.status === "ERROR") return { status: "ERROR", message: quote.message };
  return { status: "UNSERVICEABLE", message: "Sorry, we can't deliver to this pincode yet." };
}

export type BuyAgainResult = { ok: boolean; message: string; added: number; unavailable: string[] };

/** "Buy again": puts a past order's items back in the cart. Allowed for the signed-in owner or with the order link's token. */
export async function buyAgainAction(orderNumber: string, token: string): Promise<BuyAgainResult> {
  const db = getDb();
  if (!(await hitRateLimit(db, `buy-again:${await clientIp()}`, 30, 600)).allowed) return { ok: false, message: "Please wait a moment and try again.", added: 0, unavailable: [] };
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, String(orderNumber).slice(0, 20)));
  const customer = await getCustomer();
  if (!order || !((customer && order.customerId === customer.id) || checkOrderToken(order, token))) return { ok: false, message: "Order not found.", added: 0, unavailable: [] };
  const items = await db
    .select({ variantId: orderItems.variantId, productName: orderItems.productName, variantTitle: orderItems.variantTitle, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));
  const cartId = await ensureCartId();
  const r = await addOrderItemsToCart(db, cartId, items);
  refresh();
  if (r.added === 0) return { ok: false, message: "Sorry, none of these items are available right now.", added: 0, unavailable: r.unavailable };
  return { ok: true, message: r.limited ? "Added. Some quantities were reduced to what's in stock." : "Added to your cart.", added: r.added, unavailable: r.unavailable };
}

export type StockAlertState = { ok: boolean; message: string; fieldErrors?: FieldErrors } | null;

/** "Email me when it's back" on a sold-out pack. */
export async function stockAlertAction(_prev: StockAlertState, formData: FormData): Promise<StockAlertState> {
  const parsed = stockAlertSchema.safeParse({ email: formData.get("email"), variantId: formData.get("variantId") });
  if (!parsed.success) return { ok: false, message: "Please check your email address.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const db = getDb();
  if (!(await hitRateLimit(db, `stock-alert:${await clientIp()}`, 10, 3600)).allowed) return { ok: false, message: "Please try again later." };
  try {
    await subscribeStockAlert(db, parsed.data.variantId, parsed.data.email);
  } catch (err) {
    if (err instanceof StockAlertError) return { ok: false, message: err.message };
    throw err;
  }
  return { ok: true, message: "Done. We'll email you once when it's back in stock." };
}
