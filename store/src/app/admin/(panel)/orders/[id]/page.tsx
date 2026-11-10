import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderActionPanel } from "@/components/admin/order-actions";
import { Badge, Panel, statusTone } from "@/components/admin/ui";
import { Notice } from "@/components/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { emailLog, orders, payments, staffUsers } from "@/db/schema";
import { env } from "@/lib/env";
import { formatINR } from "@/lib/money";
import { formatAddress, PAYMENT_STATUS_LABELS, STATUS_LABELS } from "@/server/orders/common";
import { refundableAmount } from "@/server/orders/lifecycle";
import { loadOrderDetail } from "@/server/orders/view";
import { can } from "@/server/permissions";
import { PROBLEM_KIND_LABELS, PROBLEM_STATUS_LABELS, reportsForOrder } from "@/server/problems";

export const metadata = { title: "Order" };

export default function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading order…</p>}>
      <OrderDetail params={params} />
    </Suspense>
  );
}

function when(d: Date | null) {
  return d
    ? d.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : "—";
}

async function OrderDetail({ params }: { params: PageProps<"/admin/orders/[id]">["params"] }) {
  const staff = await requireStaff("orders.view");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) notFound();
  const detail = await loadOrderDetail(db, order, { publicOnly: false });
  const seeCustomer = can(staff.role, "orders.customerDetails");
  const seeMoney = can(staff.role, "orders.manage") || can(staff.role, "reports.finance") || can(staff.role, "orders.refund");
  const paymentRows = seeMoney ? await db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(asc(payments.createdAt)) : [];
  const emails = seeCustomer
    ? await db
        .select({
          id: emailLog.id,
          subject: emailLog.subject,
          status: emailLog.status,
          createdAt: emailLog.createdAt,
        })
        .from(emailLog)
        .where(eq(emailLog.orderId, order.id))
        .orderBy(desc(emailLog.createdAt))
    : [];
  const staffNames = new Map((await db.select({ id: staffUsers.id, name: staffUsers.name }).from(staffUsers)).map((s) => [`staff:${s.id}`, s.name]));
  const refundable = can(staff.role, "orders.refund") ? await refundableAmount(db, order) : 0;
  const shipment = detail.shipment;
  const [original] = order.replacementForOrderId ? await db.select({ id: orders.id, orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, order.replacementForOrderId)) : [];
  const reports = await reportsForOrder(db, order.id);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/orders" className="text-sm text-muted hover:underline">
            ← Orders
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 font-display text-3xl">
            Order {order.orderNumber} <Badge tone={statusTone(order.status)}>{STATUS_LABELS[order.status]}</Badge>
          </h1>
          <p className="mt-1 text-sm text-muted">
            Placed {when(order.placedAt)} · {order.paymentMethod === "COD" ? "Cash on delivery" : "Online payment"} · {PAYMENT_STATUS_LABELS[order.paymentStatus]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/admin/orders/${order.id}/packing-slip`} target="_blank" className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest">
            Packing slip
          </a>
          {detail.invoice && (
            <a href={`/orders/${order.orderNumber}/invoice`} target="_blank" className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest">
              Invoice {detail.invoice.invoiceNumber}
            </a>
          )}
          {shipment?.labelUrl && (
            <a href={shipment.labelUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-ivory">
              Shipping label
            </a>
          )}
        </div>
      </div>

      {original && (
        <Notice tone="info" className="mb-6">
          Free replacement for{" "}
          <Link href={`/admin/orders/${original.id}`} className="font-semibold underline">
            order {original.orderNumber}
          </Link>
          . No charge and no tax invoice; the courier is given the original order&apos;s invoice number.
        </Notice>
      )}
      {reports.length > 0 && (
        <Notice tone={reports.some((r) => r.status === "OPEN") ? "warn" : "info"} className="mb-6">
          The customer reported a problem with this order ({reports.map((r) => `${PROBLEM_KIND_LABELS[r.kind].toLowerCase()}: ${PROBLEM_STATUS_LABELS[r.status].toLowerCase()}`).join("; ")}
          ).{" "}
          <Link href={`/admin/problems?status=${reports[0].status}`} className="font-semibold underline">
            Open problem reports
          </Link>
        </Notice>
      )}

      <Panel title="Actions" className="mb-6">
        <OrderActionPanel
          orderId={order.id}
          status={order.status}
          paymentMethod={order.paymentMethod}
          stockState={order.stockState}
          canManage={can(staff.role, "orders.manage")}
          canPack={can(staff.role, "orders.pack")}
          canRefund={can(staff.role, "orders.refund")}
          canRestock={can(staff.role, "inventory.manage")}
          refundablePaise={refundable}
          hasShipment={!!shipment}
          simulatedCourier={env().SHIPPING_PROVIDER === "mock"}
        />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title="Items to pack">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted uppercase">
                  <th className="py-2">Item</th>
                  <th className="py-2">SKU</th>
                  <th className="py-2 text-right">Qty</th>
                  {seeMoney && <th className="py-2 text-right">Total</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {detail.items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2">
                      <span className="font-semibold">{i.productName}</span>
                      <span className="block text-xs text-muted">{i.variantTitle}</span>
                    </td>
                    <td className="py-2 font-mono text-xs">{i.sku}</td>
                    <td className="py-2 text-right text-base font-bold">{i.quantity}</td>
                    {seeMoney && <td className="py-2 text-right">{formatINR(i.lineTotalPaise)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {seeMoney && (
              <>
                <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
                  {[
                    ["Items", order.subtotalPaise],
                    ...(order.discountPaise ? [[`Discount ${order.couponCode ?? ""}`, -order.discountPaise]] : []),
                    ["Shipping charged", order.shippingPaise],
                    ...(order.codFeePaise ? [["COD fee", order.codFeePaise]] : []),
                  ].map(([l, v]) => (
                    <div key={l as string} className="flex justify-between">
                      <dt className="text-muted">{l}</dt>
                      <dd>{(v as number) < 0 ? `−${formatINR(-(v as number))}` : formatINR(v as number)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold">
                    <dt>Total</dt>
                    <dd>{formatINR(order.totalPaise)}</dd>
                  </div>
                </dl>
                <p className="mt-1 text-xs text-muted">
                  Includes {formatINR(order.taxPaise)} GST · Parcel {(order.totalWeightGrams / 1000).toFixed(2)} kg
                  {order.shippingQuote ? ` · Courier quote ${formatINR(order.shippingQuote.quotedCostPaise)} (${order.shippingQuote.courierName})` : ""}
                </p>
              </>
            )}
            {order.customerNote && <p className="mt-3 rounded-lg bg-sand/60 p-3 text-sm">Customer note: {order.customerNote}</p>}
          </Panel>

          <Panel title="Timeline">
            <ol className="space-y-2 text-sm">
              {detail.events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-36 shrink-0 text-xs text-muted">{when(e.createdAt)}</span>
                  <span>
                    {e.message}
                    <span className="block text-xs text-muted">
                      {staffNames.get(e.actor) ?? e.actor}
                      {e.isPublic ? " · shown to customer" : " · internal"}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Ship to">
            <p className="font-semibold">{order.shipName}</p>
            <p className="text-sm">{formatAddress(order)}</p>
            <p className="text-sm">{order.shipPhone}</p>
            {seeCustomer && (
              <p className="mt-2 text-sm text-muted">
                {order.email}
                {order.customerId && (
                  <>
                    {" · "}
                    <Link href={`/admin/customers/${order.customerId}`} className="underline">
                      customer profile
                    </Link>
                  </>
                )}
              </p>
            )}
            {order.billingGstin && (
              <p className="mt-2 text-sm">
                B2B invoice: {order.billingBusinessName} · GSTIN {order.billingGstin}
              </p>
            )}
          </Panel>

          <Panel title="Shipment">
            {shipment ? (
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-semibold">{shipment.courierName || shipment.provider}</span> {shipment.awb && <>· AWB {shipment.awb}</>}
                </p>
                <p className="text-muted">Status: {shipment.status.replaceAll("_", " ").toLowerCase()}</p>
                {shipment.etaDate && <p className="text-muted">Courier ETA: {shipment.etaDate}</p>}
                {shipment.trackingUrl && (
                  <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-forest underline">
                    Courier tracking page
                  </a>
                )}
                {detail.tracking.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-line pt-2 text-xs">
                    {detail.tracking.slice(0, 10).map((t) => (
                      <li key={t.id}>
                        {when(t.occurredAt)}: {t.description || t.status} {t.location && `(${t.location})`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">Not booked yet. Packing the order books the courier and creates the label.</p>
            )}
          </Panel>

          {seeMoney && (
            <Panel title="Payments & refunds">
              {paymentRows.length === 0 && detail.refunds.length === 0 && <p className="text-sm text-muted">{order.paymentMethod === "COD" ? "Cash to be collected on delivery." : "No payment yet."}</p>}
              <ul className="space-y-2 text-sm">
                {paymentRows.map((p) => (
                  <li key={p.id}>
                    <span className="font-semibold">{formatINR(p.amountPaise)}</span> · {p.status.toLowerCase()} · {p.method || "—"}
                    {p.isDuplicate && <Badge tone="warn">duplicate, refunded</Badge>}
                    <span className="block font-mono text-xs text-muted">{p.providerPaymentId}</span>
                    {p.errorDescription && <span className="block text-xs text-chilli">{p.errorDescription}</span>}
                  </li>
                ))}
                {detail.refunds.map((r) => (
                  <li key={r.id}>
                    Refund <span className="font-semibold">{formatINR(r.amountPaise)}</span> · {r.mode === "RAZORPAY" ? "Razorpay" : "manual"} · {r.status.toLowerCase()}
                    <span className="block text-xs text-muted">
                      {r.reason}
                      {r.reference && ` · ref ${r.reference}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {emails.length > 0 && (
            <Panel title="Emails sent">
              <ul className="space-y-1 text-xs">
                {emails.map((e) => (
                  <li key={e.id}>
                    {when(e.createdAt)} · {e.subject} <span className={e.status === "FAILED" ? "text-chilli" : "text-muted"}>({e.status.toLowerCase()})</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
