import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnonymiseButton } from "@/components/admin/customer-actions";
import { AdjustPointsForm } from "@/components/admin/points-form";
import { POINT_REASONS, pointsBalance, pointsHistory } from "@/server/loyalty";
import { readSettings } from "@/server/settings";
import { Badge, DataTable, PageHeader, Panel, StatTile, statusTone, Td } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { addresses, customers, orders, products, reviews } from "@/db/schema";
import { formatINR } from "@/lib/money";
import { STATUS_LABELS } from "@/server/orders/common";
import { can } from "@/server/permissions";

export const metadata = { title: "Customer" };

export default function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Customer params={params} />
    </Suspense>
  );
}

async function Customer({ params }: { params: PageProps<"/admin/customers/[id]">["params"] }) {
  const staff = await requireStaff("customers.view");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const [c] = await db.select().from(customers).where(eq(customers.id, id));
  if (!c) notFound();
  const loyalty = await readSettings(db, "loyalty");
  const [balance, history] = loyalty.pointsEnabled ? await Promise.all([pointsBalance(db, c.id), pointsHistory(db, c.id, 15)]) : [0, []];
  const [orderRows, saved, theirReviews] = await Promise.all([
    db.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.placedAt)),
    db.select().from(addresses).where(eq(addresses.customerId, id)),
    db.select({ r: reviews, product: products.name }).from(reviews).innerJoin(products, eq(products.id, reviews.productId)).where(eq(reviews.customerId, id)),
  ]);
  const completed = orderRows.filter((o) => o.confirmedAt && !["CANCELLED", "RETURNED_TO_ORIGIN"].includes(o.status));
  const spent = completed.reduce((s, o) => s + o.totalPaise, 0);

  return (
    <>
      <Link href="/admin/customers" className="text-sm text-muted hover:underline">
        ← Customers
      </Link>
      <PageHeader title={c.name || c.email} description={`${c.email}${c.phone ? ` · ${c.phone}` : ""} · customer since ${c.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`} />
      {c.deletionRequestedAt && (
        <Panel className="mb-6 border-chilli/40">
          <p className="mb-3 text-sm font-semibold text-chilli">This customer asked for their data to be deleted on {c.deletionRequestedAt.toLocaleDateString("en-IN")}. Respond within 30 days.</p>
          {can(staff.role, "staff.manage") ? <AnonymiseButton customerId={c.id} /> : <p className="text-sm text-muted">Ask the store owner to complete this.</p>}
        </Panel>
      )}
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatTile label="Completed orders" value={String(completed.length)} />
        <StatTile label="Total spent" value={formatINR(spent)} />
        <StatTile label="Average order" value={completed.length ? formatINR(Math.round(spent / completed.length)) : "—"} />
        <StatTile label="Newsletter" value={c.marketingOptIn ? "Subscribed" : "No"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <h2 className="mb-3 font-sans text-base font-bold text-forest">Orders</h2>
          <DataTable head={["Order", "Placed", "Status", "Total"]} empty={orderRows.length === 0}>
            {orderRows.map((o) => (
              <tr key={o.id}>
                <Td>
                  <Link href={`/admin/orders/${o.id}`} className="font-semibold text-forest hover:underline">
                    {o.orderNumber}
                  </Link>
                </Td>
                <Td className="text-muted">{o.placedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</Td>
                <Td>
                  <Badge tone={statusTone(o.status)}>{STATUS_LABELS[o.status]}</Badge>
                </Td>
                <Td className="font-semibold">{formatINR(o.totalPaise)}</Td>
              </tr>
            ))}
          </DataTable>
        </div>
        <div className="space-y-6">
          {loyalty.pointsEnabled && (
            <Panel title={`Loyalty points: ${balance}`}>
              {history.length > 0 ? (
                <ul className="mb-4 space-y-1 text-sm">
                  {history.map((h) => (
                    <li key={h.id} className="flex justify-between gap-3">
                      <span className="text-muted">
                        {POINT_REASONS[h.reason]}
                        {h.orderNumber ? ` #${h.orderNumber}` : ""}
                        {h.note ? ` · ${h.note}` : ""}
                      </span>
                      <span className={h.points > 0 ? "font-semibold text-forest" : "font-semibold text-chilli"}>{h.points > 0 ? `+${h.points}` : h.points}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-4 text-sm text-muted">No points yet.</p>
              )}
              {can(staff.role, "settings.manage") && <AdjustPointsForm customerId={c.id} />}
            </Panel>
          )}
          <Panel title="Saved addresses">
            {saved.length ? (
              <ul className="space-y-3 text-sm">
                {saved.map((a) => (
                  <li key={a.id}>
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-muted">
                      {a.line1}, {a.city}, {a.state} {a.pincode} · {a.phone}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">None saved.</p>
            )}
          </Panel>
          <Panel title="Reviews">
            {theirReviews.length ? (
              <ul className="space-y-2 text-sm">
                {theirReviews.map(({ r, product }) => (
                  <li key={r.id}>
                    {"★".repeat(r.rating)} {product} <span className="text-xs text-muted">({r.status.toLowerCase()})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No reviews.</p>
            )}
          </Panel>
          {!c.deletionRequestedAt && can(staff.role, "staff.manage") && (
            <Panel title="Data deletion">
              <AnonymiseButton customerId={c.id} />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
