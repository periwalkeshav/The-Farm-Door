import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { cartCount, getCartRow } from "@/server/cart";
import { cookieName } from "./cookies";

export async function cartIdFromCookie(): Promise<string | null> {
  return (await cookies()).get(cookieName("cart"))?.value ?? null;
}

export async function getCart() {
  return getCartRow(getDb(), await cartIdFromCookie());
}

export async function getCartCount(): Promise<number> {
  const cart = await getCart();
  return cart ? cartCount(getDb(), cart.id) : 0;
}
