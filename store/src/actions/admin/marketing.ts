"use server";

import { and, eq, ne } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { coupons, products, reviews } from "@/db/schema";
import { requireStaffAction } from "@/data/session";
import { couponFormSchema } from "@/lib/form-schemas";
import { rupeesToPaise } from "@/lib/money";
import { fieldErrorsFrom, formValues, type FieldErrors } from "@/lib/validation";
import { logAudit } from "@/server/audit";
import { istDayStart, addDays } from "@/server/reports";

export type MarketingResult = { ok: boolean; message: string; fieldErrors?: FieldErrors } | null;

export async function saveCouponAction(couponId: number | null, _prev: MarketingResult, formData: FormData): Promise<MarketingResult> {
  const staff = await requireStaffAction("coupons.manage");
  const parsed = couponFormSchema.safeParse(formValues(formData));
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const d = parsed.data;
  const values = {
    code: d.code,
    description: d.description,
    type: d.type,
    value: d.type === "PERCENT" ? Math.round(Number(d.value) * 100) : d.type === "FIXED" ? rupeesToPaise(d.value)! : 0,
    maxDiscountPaise: d.type === "PERCENT" ? d.maxDiscount : null,
    minOrderPaise: d.minOrder ?? 0,
    scope: d.scope,
    productIds: d.scope === "PRODUCTS" ? d.productIds : [],
    categoryIds: d.scope === "CATEGORIES" ? d.categoryIds : [],
    startsAt: d.startsOn ? istDayStart(d.startsOn) : null,
    endsAt: d.endsOn ? istDayStart(addDays(d.endsOn, 1)) : null,
    usageLimitTotal: d.usageLimitTotal,
    usageLimitPerCustomer: d.usageLimitPerCustomer,
    isActive: d.isActive,
    isFeatured: d.isFeatured,
  };
  const db = getDb();
  const [clash] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(couponId ? and(eq(coupons.code, values.code), ne(coupons.id, couponId)) : eq(coupons.code, values.code));
  if (clash) return { ok: false, message: "Another coupon already uses that code.", fieldErrors: { code: "Another coupon already uses that code." } };
  let id = couponId;
  if (couponId) await db.update(coupons).set(values).where(eq(coupons.id, couponId));
  else id = (await db.insert(coupons).values(values).returning({ id: coupons.id }))[0].id;
  await logAudit(db, { staffUserId: staff.id, action: couponId ? "coupon.update" : "coupon.create", entityType: "coupon", entityId: id!, data: { code: values.code } });
  // The scrolling banner shows the featured code.
  updateTag("coupons");
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
