"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { addresses, customers, newsletterSubscribers, orderItems, orders, reviews } from "@/db/schema";
import { requireCustomer } from "@/data/session";
import { profileSchema, reviewFields } from "@/lib/form-schemas";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/validation";

export type FormState = { ok: boolean; message: string; fieldErrors?: FieldErrors } | null;

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const parsed = profileSchema.safeParse({ name: formData.get("name"), phone: formData.get("phone") });
  if (!parsed.success) return { ok: false, message: "Please check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { name, phone } = parsed.data;
  const optIn = formData.get("marketingOptIn") === "on";
  const db = getDb();
  await db.update(customers).set({ name, phone, marketingOptIn: optIn, marketingOptInAt: optIn ? new Date() : null }).where(eq(customers.id, customer.id));
  if (optIn) {
    await db.insert(newsletterSubscribers).values({ email: customer.email, source: "account" }).onConflictDoUpdate({ target: newsletterSubscribers.email, set: { unsubscribedAt: null } });
  } else {
    await db.update(newsletterSubscribers).set({ unsubscribedAt: new Date() }).where(eq(newsletterSubscribers.email, customer.email));
  }
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteAddressAction(addressId: number) {
  const customer = await requireCustomer();
  await getDb().delete(addresses).where(and(eq(addresses.id, addressId), eq(addresses.customerId, customer.id)));
  refresh();
}

export async function setDefaultAddressAction(addressId: number) {
  const customer = await requireCustomer();
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.customerId, customer.id));
    await tx.update(addresses).set({ isDefault: true }).where(and(eq(addresses.id, addressId), eq(addresses.customerId, customer.id)));
  });
  refresh();
}

export async function requestDeletionAction(): Promise<FormState> {
  const customer = await requireCustomer();
  await getDb().update(customers).set({ deletionRequestedAt: new Date() }).where(eq(customers.id, customer.id));
  refresh();
  return { ok: true, message: "We've received your request. We'll delete your personal data within 30 days, keeping only what tax law requires for past invoices." };
}

const reviewSchema = reviewFields.extend({
  productId: z.coerce.number().int().positive(),
  rating: z.coerce.number().int().min(1, "Choose a star rating.").max(5),
});

/** Reviews are only accepted from customers with a delivered order containing the product, and wait for approval. */
export async function submitReviewAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const customer = await requireCustomer();
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Please check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const db = getDb();
  const [delivered] = await db
    .select({ orderId: orders.id })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.customerId, customer.id), eq(orders.status, "DELIVERED"), eq(orderItems.productId, parsed.data.productId)))
    .limit(1);
  if (!delivered) return { ok: false, message: "You can review products from delivered orders." };
  const authorName = (customer.name || customer.email.split("@")[0]).split(" ")[0] + (customer.name.includes(" ") ? ` ${customer.name.split(" ").at(-1)![0]}.` : "");
  await db
    .insert(reviews)
    .values({ productId: parsed.data.productId, customerId: customer.id, orderId: delivered.orderId, rating: parsed.data.rating, title: parsed.data.title, body: parsed.data.body, authorName })
    .onConflictDoUpdate({
      target: [reviews.productId, reviews.customerId],
      set: { rating: parsed.data.rating, title: parsed.data.title, body: parsed.data.body, status: "PENDING", createdAt: sql`now()` },
    });
  refresh();
  return { ok: true, message: "Thank you! Your review will appear once it's been checked." };
}
