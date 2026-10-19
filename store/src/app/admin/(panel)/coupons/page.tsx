import { asc, desc } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { CouponForm } from "@/components/admin/marketing-forms";
import { Badge, DataTable, PageHeader, Panel, Td } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { categories, coupons, products } from "@/db/schema";
import { describeCoupon } from "@/lib/coupon-label";

export const metadata = { title: "Coupons" };

export default function CouponsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading coupons…</p>}>
      <Coupons />
    </Suspense>
  );
}

async function Coupons() {
  await requireStaff("coupons.manage");
  const db = getDb();
  const [rows, prods, cats] = await Promise.all([
    db.select().from(coupons).orderBy(desc(coupons.isActive), desc(coupons.createdAt)),
    db.select({ id: products.id, name: products.name }).from(products).orderBy(asc(products.name)),
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.sortOrder)),
  ]);
  const now = new Date();
  return (
    <>
      <PageHeader title="Coupons" description="Discount codes customers enter in the cart. Every rule is checked on the server at checkout; a use is only counted once the order is placed, and given back if it's never paid or confirmed." />
      <DataTable head={["Code", "Discount", "Used", "Valid", "Status"]} empty={rows.length === 0}>
        {rows.map((c) => {
          const expired = c.endsAt !== null && c.endsAt <= now;
          const upcoming = c.startsAt !== null && c.startsAt > now;
          return (
            <tr key={c.id} className="hover:bg-ivory">
              <Td>
                <Link href={`/admin/coupons/${c.id}`} className="font-mono font-bold text-forest hover:underline">
                  {c.code}
                </Link>
                {c.description && <span className="block text-xs text-muted">{c.description}</span>}
              </Td>
              <Td>{describeCoupon(c)}</Td>
              <Td className="whitespace-nowrap">
                {c.timesUsed}
                {c.usageLimitTotal ? ` / ${c.usageLimitTotal}` : ""}
                {c.usageLimitPerCustomer ? <span className="block text-xs text-muted">{c.usageLimitPerCustomer} per customer</span> : null}
              </Td>
              <Td className="whitespace-nowrap text-muted">
                {c.startsAt ? c.startsAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "Now"} – {c.endsAt ? new Date(c.endsAt.getTime() - 1).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "no end"}
              </Td>
              <Td>{!c.isActive ? <Badge>off</Badge> : expired ? <Badge tone="warn">expired</Badge> : upcoming ? <Badge tone="info">scheduled</Badge> : <Badge tone="good">live</Badge>}</Td>
            </tr>
          );
        })}
      </DataTable>
      <Panel title="New coupon" className="mt-6">
        <CouponForm
          coupon={{ id: null, code: "", description: "", type: "PERCENT", value: "", maxDiscount: "", minOrder: "", scope: "ALL", productIds: [], categoryIds: [], startsOn: "", endsOn: "", usageLimitTotal: "", usageLimitPerCustomer: "", isActive: true }}
          products={prods}
          categories={cats}
        />
      </Panel>
    </>
  );
}
