"use server";

import { and, eq, ne } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { coupons, products, reviews } from "@/db/schema";
import { requireStaffAction } from "@/data/session";
import { rupeesToPaise } from "@/lib/money";
import { logAudit } from "@/server/audit";
import { istDayStart, addDays } from "@/server/reports";

export type MarketingResult = { ok: boolean; message: string } | null;

const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,30}$/, "Codes are 3–30 letters/numbers (dash and underscore allowed)."),
  description: z.string().trim().max(200).default(""),
  type: z.enum(["PERCENT", "FIXED", "FREE_SHIPPING"]),
  value: z.string().default(""),
  maxDiscount: z.string().default(""),
  minOrder: z.string().default(""),
  scope: z.enum(["ALL", "PRODUCTS", "CATEGORIES"]),
  productIds: z.array(z.coerce.number().int().positive()).default([]),
  categoryIds: z.array(z.coerce.number().int().positive()).default([]),
  startsOn: z.string().default(""),
  endsOn: z.string().default(""),
  usageLimitTotal: z.string().default(""),
  usageLimitPerCustomer: z.string().default(""),
  isActive: z.boolean(),
});

function optionalPaise(v: string, label: string): number | null {
  if (!v.trim()) return null;
  const p = rupeesToPaise(v);
  if (p === null) throw new Error(`Enter ${label} in rupees.`);
  return p;
}

function optionalInt(v: string, label: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${label} must be a whole number of at least 1.`);
  return n;
}

export async function saveCouponAction(couponId: number | null, _prev: MarketingResult, formData: FormData): Promise<MarketingResult> {
  const staff = await requireStaffAction("coupons.manage");
  const parsed = couponSchema.safeParse({
    ...Object.fromEntries(formData),
    productIds: formData.getAll("productIds"),
    categoryIds: formData.getAll("categoryIds"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  let values;
  try {
    let value = 0;
    if (d.type === "PERCENT") {
      const pct = Number(d.value);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 90) throw new Error("Percentage must be between 0 and 90.");
      value = Math.round(pct * 100);
    } else if (d.type === "FIXED") {
      const p = optionalPaise(d.value, "the discount amount");
      if (!p) throw new Error("Enter the discount amount in rupees.");
      value = p;
    }
    if (d.scope === "PRODUCTS" && !d.productIds.length) throw new Error("Choose at least one product.");
    if (d.scope === "CATEGORIES" && !d.categoryIds.length) throw new Error("Choose at least one category.");
    const startsAt = /^\d{4}-\d{2}-\d{2}$/.test(d.startsOn) ? istDayStart(d.startsOn) : null;
    const endsAt = /^\d{4}-\d{2}-\d{2}$/.test(d.endsOn) ? istDayStart(addDays(d.endsOn, 1)) : null;
    if (startsAt && endsAt && endsAt <= startsAt) throw new Error("The end date must be after the start date.");
    values = {
      code: d.code,
      description: d.description,
      type: d.type,
      value,
      maxDiscountPaise: d.type === "PERCENT" ? optionalPaise(d.maxDiscount, "the maximum discount") : null,
      minOrderPaise: optionalPaise(d.minOrder, "the minimum order") ?? 0,
      scope: d.scope,
      productIds: d.scope === "PRODUCTS" ? d.productIds : [],
      categoryIds: d.scope === "CATEGORIES" ? d.categoryIds : [],
      startsAt,
      endsAt,
      usageLimitTotal: optionalInt(d.usageLimitTotal, "Total uses"),
      usageLimitPerCustomer: optionalInt(d.usageLimitPerCustomer, "Uses per customer"),
      isActive: d.isActive,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Check the form." };
  }
  const db = getDb();
  const [clash] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(couponId ? and(eq(coupons.code, values.code), ne(coupons.id, couponId)) : eq(coupons.code, values.code));
  if (clash) return { ok: false, message: "Another coupon already uses that code." };
  let id = couponId;
  if (couponId) await db.update(coupons).set(values).where(eq(coupons.id, couponId));
  else id = (await db.insert(coupons).values(values).returning({ id: coupons.id }))[0].id;
  await logAudit(db, { staffUserId: staff.id, action: couponId ? "coupon.update" : "coupon.create", entityType: "coupon", entityId: id!, data: { code: values.code } });
  if (!couponId) redirect(`/admin/coupons/${id}?created=1`);
  refresh();
  return { ok: true, message: "Saved." };
}

export async function moderateReviewAction(reviewId: number, status: "APPROVED" | "REJECTED") {
  const staff = await requireStaffAction("reviews.manage");
  const db = getDb();
  const [r] = await db.update(reviews).set({ status, moderatedAt: new Date() }).where(eq(reviews.id, reviewId)).returning({ productId: reviews.productId });
  if (r) {
    const [p] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, r.productId));
    await logAudit(db, { staffUserId: staff.id, action: `review.${status.toLowerCase()}`, entityType: "review", entityId: reviewId });
    updateTag("reviews");
    updateTag("catalog");
    if (p) updateTag(`product:${p.slug}`);
  }
  refresh();
}
