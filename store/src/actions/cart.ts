"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { carts, inventoryItems, productVariants } from "@/db/schema";
import { cookieName, cookieOptions } from "@/data/cookies";
import { clientIp } from "@/data/request";
import { getCustomer } from "@/data/session";
import { isValidPincode } from "@/lib/india";
import { addToCart, CartError, cartCount, createCart, getCartRow, setCartQuantity } from "@/server/cart";
import { checkCoupon } from "@/server/coupons";
import { loadCartLines, toPricingLines } from "@/server/cart";
import { hitRateLimit } from "@/server/rate-limit";
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
