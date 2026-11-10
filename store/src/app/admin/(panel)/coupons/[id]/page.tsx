import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CouponForm } from "@/components/admin/marketing-forms";
import { DataTable, PageHeader, Panel, Td } from "@/components/admin/ui";
import { Notice } from "@/components/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { categories, couponRedemptions, coupons, orders, products } from "@/db/schema";
import { describeCoupon } from "@/lib/coupon-label";
import { formatINR, paiseToRupeesString } from "@/lib/money";

export const metadata = { title: "Coupon" };

function istDate(d: Date | null, endExclusive = false) {
  if (!d) return "";
  const t = new Date(d.getTime() + 5.5 * 3600_000 - (endExclusive ? 1 : 0));
  return t.toISOString().slice(0, 10);
}

export default function CouponPage({ params, searchParams }: PageProps<"/admin/coupons/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Coupon params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Coupon({ params, searchParams }: Pick<PageProps<"/admin/coupons/[id]">, "params" | "searchParams">) {
  await requireStaff("coupons.manage");
  const id = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const [c] = await db.select().from(coupons).where(eq(coupons.id, id));
  if (!c) notFound();
  const [prods, cats, uses] = await Promise.all([
    db.select({ id: products.id, name: products.name }).from(products).orderBy(asc(products.name)),
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.sortOrder)),
    db
      .select({ r: couponRedemptions, orderNumber: orders.orderNumber, orderId: orders.id, status: orders.status })
      .from(couponRedemptions)
      .innerJoin(orders, eq(orders.id, couponRedemptions.orderId))
      .where(and(eq(couponRedemptions.couponId, id)))
      .orderBy(desc(couponRedemptions.createdAt))
      .limit(100),
  ]);
  return (
    <>
      <Link href="/admin/coupons" className="text-sm text-muted hover:underline">
        ← Coupons
      </Link>
      <PageHeader title={c.code} description={describeCoupon(c)} />
      {sp.created === "1" && <Notice tone="success" className="mb-4">Coupon created.</Notice>}
      <Panel className="mb-6">
        <CouponForm
          coupon={{
            id: c.id,
            code: c.code,
            description: c.description,
            type: c.type,
            value: c.type === "PERCENT" ? String(c.value / 100) : c.type === "FIXED" ? paiseToRupeesString(c.value) : "",
            maxDiscount: c.maxDiscountPaise ? paiseToRupeesString(c.maxDiscountPaise) : "",
            minOrder: c.minOrderPaise ? paiseToRupeesString(c.minOrderPaise) : "",
            scope: c.scope,
            productIds: c.productIds,
            categoryIds: c.categoryIds,
            startsOn: istDate(c.startsAt),
            endsOn: istDate(c.endsAt, true),
            usageLimitTotal: c.usageLimitTotal ? String(c.usageLimitTotal) : "",
            usageLimitPerCustomer: c.usageLimitPerCustomer ? String(c.usageLimitPerCustomer) : "",
            isActive: c.isActive,
            isFeatured: c.isFeatured,
          }}
          products={prods}
          categories={cats}
        />
      </Panel>
      <h2 className="mb-3 font-sans text-base font-bold text-forest">Recent uses</h2>
      <DataTable head={["Order", "Customer", "Discount", "Counted"]} empty={uses.length === 0}>
        {uses.map(({ r, orderNumber, orderId, status }) => (
          <tr key={r.id}>
            <Td>
              <Link href={`/admin/orders/${orderId}`} className="font-semibold text-forest underline">
                {orderNumber}
              </Link>
              <span className="block text-xs text-muted">{status.toLowerCase().replaceAll("_", " ")}</span>
            </Td>
            <Td className="text-muted">{r.email}</Td>
            <Td>{formatINR(r.discountPaise)}</Td>
            <Td className="text-muted">{r.isActive ? "Yes" : "No (order never confirmed)"}</Td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
