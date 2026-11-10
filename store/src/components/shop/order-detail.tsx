import Link from "next/link";
import { Notice, cn } from "@/components/ui";
import { formatINR } from "@/lib/money";
import { canCustomerCancel } from "@/server/orders/lifecycle";
import { PAYMENT_STATUS_FOR_CUSTOMER, STATUS_LABELS, formatAddress, orderAccessToken } from "@/server/orders/common";
import type { OrderDetail } from "@/server/orders/view";
import { BuyAgainButton, CancelOrderButton, ConfirmCodButton, PayNowButton } from "./order-actions";
import { ReportProblem } from "./problem-report";
import { RefillReminderControl } from "./refill-reminder";
import { etaText } from "./order-summary";
import { dateLocale, type Locale } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { rich } from "@/i18n/rich";
import { translateParts } from "@/i18n/translate";

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

function fmtDate(d: Date, lang: Locale) {
  return d.toLocaleString(dateLocale(lang), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export async function OrderDetailView({
  detail,
  mode,
  confirmParam,
  justPlaced,
  unpaid,
  refillDays = null,
  problems = null,
  replacementFor = null,
}: {
  detail: OrderDetail;
  mode: "owner" | "tracking";
  confirmParam?: string;
  justPlaced?: boolean;
  unpaid?: boolean;
  /** Current reorder-reminder interval for a delivered order, if any. */
  refillDays?: number | null;
  /** Problem reports on this order, and whether a new one can be made (delivered in the last 48 hours). */
  problems?: { reports: { id: number; kindLabel: string; status: string; statusText: string; resolutionNote: string; createdAt: Date }[]; deadline: Date | null; canReport: boolean } | null;
  /** Order number this order is a free replacement for. */
  replacementFor?: string | null;
}) {
  const { lang, t, href } = await getI18n();
  const date = (d: Date) => fmtDate(d, lang);
  const { order, items, events, shipment, tracking, invoice, refunds } = detail;
  const token = orderAccessToken(order);
  const stepIndex = STEPS.findIndex((s) => s.statuses.includes(order.status));
  const stopped = order.status === "CANCELLED" || order.status === "RETURNED_TO_ORIGIN";
  const minutesLeft = minutesUntil(order.reservationExpiresAt);
  const expiredUnpaid = order.status === "CANCELLED" && order.paymentMethod === "PREPAID" && !order.confirmedAt;
  const canBuyAgain = order.status !== "AWAITING_PAYMENT" && order.status !== "AWAITING_COD_CONFIRMATION";

  return (
    <div className="space-y-6">
      {justPlaced && order.status === "CONFIRMED" && <Notice tone="success">{t("Thank you! Your order is confirmed. We've emailed the details to {email}.", { email: order.email })}</Notice>}
      {/* Opened from the COD confirmation email after confirming (the confirm button is gone once confirmed). */}
      {confirmParam && mode === "owner" && order.paymentMethod === "COD" && order.confirmedAt && order.status !== "CANCELLED" && (
        <Notice tone="success">{t("Thank you! Your order is confirmed and we'll start packing it.")}</Notice>
      )}
      {replacementFor && <Notice tone="info">{t("This is a free replacement for order {order}. There's nothing to pay.", { order: replacementFor })}</Notice>}
      {unpaid && order.status === "AWAITING_PAYMENT" && <Notice tone="warn">{t("Your payment wasn't completed. Your items are held for a short while; pay below to confirm the order.")}</Notice>}
      {expiredUnpaid && mode === "owner" && (
        <Notice tone="info">
          {t("This order wasn't paid, so it was cancelled and nothing was charged. You can add the same items to your cart again below.")}
        </Notice>
      )}

      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{t("Order {number}", { number: order.orderNumber })}</p>
            <p className={cn("font-display text-3xl font-semibold", order.status === "CANCELLED" ? "text-chilli" : "text-forest")}>{t(STATUS_LABELS[order.status])}</p>
            <p className="mt-1 text-sm text-muted">{t("Placed {date}", { date: date(order.placedAt) })}</p>
          </div>
          {mode === "owner" && invoice && (
            <div className="flex flex-wrap gap-2">
              <a href={`/orders/${order.orderNumber}/invoice?t=${token}`} target="_blank" className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest hover:bg-forest/5">
                {t("Tax invoice {number}", { number: invoice.invoiceNumber })}
              </a>
              <a href={`/orders/${order.orderNumber}/invoice.pdf?t=${token}`} className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest hover:bg-forest/5" aria-label={t("Download tax invoice {number} as PDF", { number: invoice.invoiceNumber })}>
                PDF
              </a>
            </div>
          )}
        </div>

        {!stopped && (
          <ol className="mt-6 grid grid-cols-5 gap-1" aria-label={t("Order progress")}>
            {STEPS.map((s, i) => (
              <li key={s.key} className="text-center">
                <div className={cn("h-1.5 rounded-full", i <= stepIndex ? "bg-forest" : "bg-line")} />
                <p className={cn("mt-2 text-[11px] font-semibold sm:text-xs", i <= stepIndex ? "text-forest" : "text-muted")}>{t(s.label)}</p>
              </li>
            ))}
          </ol>
        )}

        {order.status === "AWAITING_PAYMENT" && mode === "owner" && (
          <div className="mt-6 rounded-xl bg-sand/60 p-4">
            <p className="font-semibold text-forest">{t("Payment pending")}</p>
            <p className="mt-1 mb-3 text-sm text-muted">
              {minutesLeft > 0
                ? t(minutesLeft === 1 ? "Complete payment within about {minutes} minute to keep your items." : "Complete payment within about {minutes} minutes to keep your items.", { minutes: minutesLeft })
                : t("The payment window is closing; this order may be cancelled shortly.")}
            </p>
            <PayNowButton orderNumber={order.orderNumber} token={token} />
          </div>
        )}
        {order.status === "AWAITING_COD_CONFIRMATION" && mode === "owner" && (
          <div className="mt-6 rounded-xl bg-sand/60 p-4">
            {confirmParam ? (
              <ConfirmCodButton orderNumber={order.orderNumber} confirmToken={confirmParam} />
            ) : (
              <>
                <p className="font-semibold text-forest">{t("Please confirm your order")}</p>
                <p className="mt-1 text-sm text-muted">{t("We've emailed a confirmation link to {email}. We'll pack your order once it's confirmed. Didn't get it? Check your spam folder.", { email: order.email })}</p>
              </>
            )}
          </div>
        )}
        {order.status === "CANCELLED" && order.cancelReason && <p className="mt-4 text-sm text-muted">{t(order.cancelReason)}</p>}

        {shipment && (shipment.awb || shipment.trackingUrl) && (
          <div className="mt-6 rounded-xl border border-line p-4 text-sm">
            <p className="font-semibold text-forest">
              {shipment.courierName || t("Courier")}
              {shipment.awb ? ` · AWB ${shipment.awb}` : ""}
            </p>
            {shipment.etaDate && order.status !== "DELIVERED" && <p className="mt-1 text-muted">{etaText(shipment.etaDate, null, lang)}</p>}
            {shipment.trackingUrl && (
              <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-forest underline">
                {t("Track on courier website →")}
              </a>
            )}
            {tracking.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-line pt-3">
                {tracking.slice(0, 8).map((ev) => (
                  <li key={ev.id} className="flex gap-3">
                    <span className="w-28 shrink-0 text-xs text-muted">{date(ev.occurredAt)}</span>
                    <span>
                      {ev.description || ev.status}
                      {ev.location && <span className="block text-xs text-muted">{ev.location}</span>}
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
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-xl">{t("Items")}</h2>
              {canBuyAgain && <BuyAgainButton orderNumber={order.orderNumber} token={token} label={expiredUnpaid ? "Add these items to my cart" : "Buy again"} />}
            </div>
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i.id} className="flex justify-between gap-4 py-3 text-sm">
                  <span>
                    <span className="font-semibold text-forest">{i.productName}</span>
                    <span className="block text-muted">
                      {translateParts(lang, i.variantTitle)} × {i.quantity}
                    </span>
                  </span>
                  <span className="font-semibold">{formatINR(i.lineSubtotalPaise)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">{t("Items")}</dt>
                <dd>{formatINR(order.subtotalPaise)}</dd>
              </div>
              {order.discountPaise > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">
                    {t("Discount")}
                    {order.couponCode ? ` (${order.couponCode})` : ""}
                  </dt>
                  <dd>−{formatINR(order.discountPaise)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">{t("Shipping")}</dt>
                <dd>{order.shippingPaise ? formatINR(order.shippingPaise) : t("Free")}</dd>
              </div>
              {order.codFeePaise > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">{t("Cash on delivery fee")}</dt>
                  <dd>{formatINR(order.codFeePaise)}</dd>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-forest">
                <dt>{t("Total")}</dt>
                <dd>{formatINR(order.totalPaise)}</dd>
              </div>
            </dl>
            <p className="mt-1 text-xs text-muted">{t("Includes {amount} GST", { amount: formatINR(order.taxPaise) })}</p>
          </section>
          <aside className="space-y-6">
            <section className="card p-5 text-sm">
              <h2 className="mb-2 text-lg">{t("Delivery address")}</h2>
              <p className="font-semibold">{order.shipName}</p>
              <p className="text-muted">{formatAddress(order)}</p>
              <p className="text-muted">{order.shipPhone}</p>
            </section>
            <section className="card p-5 text-sm">
              <h2 className="mb-2 text-lg">{t("Payment")}</h2>
              <p>{t(replacementFor ? "No charge (replacement)" : order.paymentMethod === "COD" ? "Cash on delivery" : "Online payment")}</p>
              {!replacementFor && PAYMENT_STATUS_FOR_CUSTOMER[order.paymentStatus] && <p className="text-muted">{t(PAYMENT_STATUS_FOR_CUSTOMER[order.paymentStatus])}</p>}
              {refunds
                .filter((r) => r.status !== "FAILED")
                .map((r) => (
                  <p key={r.id} className="mt-1 text-muted">
                    {t("Refund {amount}", { amount: formatINR(r.amountPaise) })} · {t(r.status === "PROCESSED" ? "processed" : "in progress")}
                  </p>
                ))}
            </section>
            {problems && (problems.canReport || problems.reports.length > 0) && (
              <section className="card p-5" id="problem">
                <h2 className="mb-2 text-lg">{t("Something wrong?")}</h2>
                {problems.reports.map((r) => (
                  <div key={r.id} className="mb-3 rounded-xl bg-sand/60 p-3 text-sm">
                    <p className="font-semibold text-forest">
                      {t("You reported: {problem}", { problem: lang === "hi" ? t(r.kindLabel) : r.kindLabel.toLowerCase() })} · {date(r.createdAt)}
                    </p>
                    <p className="mt-1">{t(r.statusText)}</p>
                    {r.resolutionNote && <p className="mt-1 text-muted">{r.resolutionNote}</p>}
                  </div>
                ))}
                {problems.canReport && !problems.reports.some((r) => r.status === "OPEN") && problems.deadline && (
                  <ReportProblem
                    orderNumber={order.orderNumber}
                    token={token}
                    items={items.map((i) => ({ id: i.id, label: `${i.productName} (${translateParts(lang, i.variantTitle)}) × ${i.quantity}` }))}
                    deadline={date(problems.deadline)}
                  />
                )}
              </section>
            )}
            {order.status === "DELIVERED" && (
              <section className="card p-5">
                <h2 className="mb-2 text-lg">{t("Reorder reminder")}</h2>
                <RefillReminderControl orderNumber={order.orderNumber} token={token} current={refillDays} />
              </section>
            )}
            {canCustomerCancel(order) && (
              <section className="card p-5">
                <CancelOrderButton orderNumber={order.orderNumber} token={token} paid={order.paymentStatus === "PAID"} />
                <p className="mt-2 text-xs text-muted">{t("You can cancel until we pack your order.")}</p>
              </section>
            )}
          </aside>
        </div>
      )}

      {events.length > 0 && (
        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 text-xl">{t("Updates")}</h2>
          <ol className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="w-28 shrink-0 text-xs text-muted">{date(e.createdAt)}</span>
                <span>{t(e.message)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {mode === "tracking" && (
        <p className="text-sm text-muted">
          {rich(t("For full order details, use the link in your order email or {link}."), {
            link: (
              <Link href={href("/login")} className="font-semibold text-forest underline">
                {t("sign in")}
              </Link>
            ),
          })}
        </p>
      )}
    </div>
  );
}

