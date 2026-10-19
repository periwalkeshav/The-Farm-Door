import Link from "next/link";
import { Notice, cn } from "@/components/ui";
import { formatINR } from "@/lib/money";
import { canCustomerCancel } from "@/server/orders/lifecycle";
import { PAYMENT_STATUS_LABELS, STATUS_LABELS, formatAddress, orderAccessToken } from "@/server/orders/common";
import type { OrderDetail } from "@/server/orders/view";
import { CancelOrderButton, ConfirmCodButton, PayNowButton } from "./order-actions";
import { etaText } from "./order-summary";

const STEPS: { key: string; label: string; statuses: string[] }[] = [
  { key: "placed", label: "Placed", statuses: ["AWAITING_PAYMENT", "AWAITING_COD_CONFIRMATION"] },
  { key: "confirmed", label: "Confirmed", statuses: ["CONFIRMED"] },
  { key: "packed", label: "Packed", statuses: ["PACKED"] },
  { key: "shipped", label: "Shipped", statuses: ["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERY_FAILED"] },
  { key: "delivered", label: "Delivered", statuses: ["DELIVERED"] },
];

function minutesUntil(date: Date | null) {
  return date ? Math.max(0, Math.ceil((date.getTime() - Date.now()) / 60000)) : 0;
}

function fmtDate(d: Date) {
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export function OrderDetailView({ detail, mode, confirmParam, justPlaced, unpaid }: { detail: OrderDetail; mode: "owner" | "tracking"; confirmParam?: string; justPlaced?: boolean; unpaid?: boolean }) {
  const { order, items, events, shipment, tracking, invoice, refunds } = detail;
  const token = orderAccessToken(order);
  const stepIndex = STEPS.findIndex((s) => s.statuses.includes(order.status));
  const stopped = order.status === "CANCELLED" || order.status === "RETURNED_TO_ORIGIN";
  const minutesLeft = minutesUntil(order.reservationExpiresAt);

  return (
    <div className="space-y-6">
      {justPlaced && order.status === "CONFIRMED" && <Notice tone="success">Thank you! Your order is confirmed. We&apos;ve emailed the details to {order.email}.</Notice>}
      {unpaid && order.status === "AWAITING_PAYMENT" && <Notice tone="warn">Your payment wasn&apos;t completed. Your items are held for a short while; pay below to confirm the order.</Notice>}

      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Order {order.orderNumber}</p>
            <p className={cn("font-display text-3xl font-semibold", order.status === "CANCELLED" ? "text-chilli" : "text-forest")}>{STATUS_LABELS[order.status]}</p>
            <p className="mt-1 text-sm text-muted">Placed {fmtDate(order.placedAt)}</p>
          </div>
          {mode === "owner" && invoice && (
            <a href={`/orders/${order.orderNumber}/invoice?t=${token}`} target="_blank" className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest hover:bg-forest/5">
              Tax invoice {invoice.invoiceNumber}
            </a>
          )}
        </div>

        {!stopped && (
          <ol className="mt-6 grid grid-cols-5 gap-1" aria-label="Order progress">
            {STEPS.map((s, i) => (
              <li key={s.key} className="text-center">
                <div className={cn("h-1.5 rounded-full", i <= stepIndex ? "bg-forest" : "bg-line")} />
                <p className={cn("mt-2 text-[11px] font-semibold sm:text-xs", i <= stepIndex ? "text-forest" : "text-muted")}>{s.label}</p>
              </li>
            ))}
          </ol>
        )}

        {order.status === "AWAITING_PAYMENT" && mode === "owner" && (
          <div className="mt-6 rounded-xl bg-sand/60 p-4">
            <p className="font-semibold text-forest">Payment pending</p>
            <p className="mt-1 mb-3 text-sm text-muted">{minutesLeft > 0 ? `Complete payment within about ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"} to keep your items.` : "The payment window is closing; this order may be cancelled shortly."}</p>
            <PayNowButton orderNumber={order.orderNumber} token={token} />
          </div>
        )}
        {order.status === "AWAITING_COD_CONFIRMATION" && mode === "owner" && (
          <div className="mt-6 rounded-xl bg-sand/60 p-4">
            {confirmParam ? (
              <ConfirmCodButton orderNumber={order.orderNumber} confirmToken={confirmParam} />
            ) : (
              <>
                <p className="font-semibold text-forest">Please confirm your order</p>
                <p className="mt-1 text-sm text-muted">We&apos;ve emailed a confirmation link to {order.email}. We&apos;ll pack your order once it&apos;s confirmed. Didn&apos;t get it? Check your spam folder.</p>
              </>
            )}
          </div>
        )}
        {order.status === "CANCELLED" && order.cancelReason && <p className="mt-4 text-sm text-muted">{order.cancelReason}</p>}

        {shipment && (shipment.awb || shipment.trackingUrl) && (
          <div className="mt-6 rounded-xl border border-line p-4 text-sm">
            <p className="font-semibold text-forest">
              {shipment.courierName || "Courier"}
              {shipment.awb ? ` · AWB ${shipment.awb}` : ""}
            </p>
            {shipment.etaDate && order.status !== "DELIVERED" && <p className="mt-1 text-muted">{etaText(shipment.etaDate, null)}</p>}
            {shipment.trackingUrl && (
              <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-forest underline">
                Track on courier website →
              </a>
            )}
            {tracking.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-line pt-3">
                {tracking.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex gap-3">
                    <span className="w-28 shrink-0 text-xs text-muted">{fmtDate(t.occurredAt)}</span>
                    <span>
                      {t.description || t.status}
                      {t.location && <span className="block text-xs text-muted">{t.location}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {mode === "owner" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="card p-5 sm:p-6">
            <h2 className="mb-4 text-xl">Items</h2>
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i.id} className="flex justify-between gap-4 py-3 text-sm">
                  <span>
                    <span className="font-semibold text-forest">{i.productName}</span>
                    <span className="block text-muted">
                      {i.variantTitle} × {i.quantity}
                    </span>
                  </span>
                  <span className="font-semibold">{formatINR(i.lineSubtotalPaise)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Items</dt>
                <dd>{formatINR(order.subtotalPaise)}</dd>
              </div>
              {order.discountPaise > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">Discount{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
                  <dd>−{formatINR(order.discountPaise)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">Shipping</dt>
                <dd>{order.shippingPaise ? formatINR(order.shippingPaise) : "Free"}</dd>
              </div>
              {order.codFeePaise > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">Cash on delivery fee</dt>
                  <dd>{formatINR(order.codFeePaise)}</dd>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-forest">
                <dt>Total</dt>
                <dd>{formatINR(order.totalPaise)}</dd>
              </div>
              <p className="text-xs text-muted">Includes {formatINR(order.taxPaise)} GST</p>
            </dl>
          </section>
          <aside className="space-y-6">
            <section className="card p-5 text-sm">
              <h2 className="mb-2 text-lg">Delivery address</h2>
              <p className="font-semibold">{order.shipName}</p>
              <p className="text-muted">{formatAddress(order)}</p>
              <p className="text-muted">{order.shipPhone}</p>
            </section>
            <section className="card p-5 text-sm">
              <h2 className="mb-2 text-lg">Payment</h2>
              <p>{order.paymentMethod === "COD" ? "Cash on delivery" : "Paid online"}</p>
              <p className="text-muted">{PAYMENT_STATUS_LABELS[order.paymentStatus]}</p>
              {refunds
                .filter((r) => r.status !== "FAILED")
                .map((r) => (
                  <p key={r.id} className="mt-1 text-muted">
                    Refund {formatINR(r.amountPaise)} · {r.status === "PROCESSED" ? "processed" : "in progress"}
                  </p>
                ))}
            </section>
            {canCustomerCancel(order) && (
              <section className="card p-5">
                <CancelOrderButton orderNumber={order.orderNumber} token={token} paid={order.paymentStatus === "PAID"} />
                <p className="mt-2 text-xs text-muted">You can cancel until we pack your order.</p>
              </section>
            )}
          </aside>
        </div>
      )}

      {events.length > 0 && (
        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 text-xl">Updates</h2>
          <ol className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="w-28 shrink-0 text-xs text-muted">{fmtDate(e.createdAt)}</span>
                <span>{e.message}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {mode === "tracking" && (
        <p className="text-sm text-muted">
          For full order details, use the link in your order email or{" "}
          <Link href="/login" className="font-semibold text-forest underline">
            sign in
          </Link>
          .
        </p>
      )}
    </div>
  );
}

