import { formatINR } from "@/lib/money";
import type { CheckoutView } from "@/server/checkout-view";

export function etaText(etaDate: string | null, etaDays: number | null) {
  if (etaDate) {
    const d = new Date(`${etaDate}T12:00:00+05:30`);
    return `Estimated delivery by ${d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`;
  }
  return etaDays ? `Estimated delivery in about ${etaDays} day${etaDays === 1 ? "" : "s"}` : null;
}

/** Totals block shared by the cart and checkout. */
export function Totals({ view }: { view: CheckoutView }) {
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-4 ${strong ? "text-base font-bold text-forest" : "text-sm"}`}>
      <dt className={strong ? "" : "text-muted"}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  return (
    <div>
      <dl className="space-y-2">
        {row("Items", formatINR(view.subtotalPaise))}
        {view.discountPaise > 0 && row(`Discount${view.couponCode ? ` (${view.couponCode})` : ""}`, `−${formatINR(view.discountPaise)}`)}
        {row(
          "Shipping",
          view.shippingPaise === null ? (view.shipping.status === "NEED_PINCODE" ? "Enter pincode" : "Not available") : view.shippingPaise === 0 ? "Free" : formatINR(view.shippingPaise),
        )}
        {view.codFeePaise > 0 && row("Cash on delivery fee", formatINR(view.codFeePaise))}
        <div className="border-t border-line pt-2">{row("Total", view.totalPaise === null ? "—" : formatINR(view.totalPaise), true)}</div>
      </dl>
      {view.taxPaise !== null && view.totalPaise !== null && <p className="mt-1 text-xs text-muted">Includes {formatINR(view.taxPaise)} GST</p>}
      {view.freeShippingGapPaise !== null && view.freeShippingGapPaise > 0 && (
        <p className="mt-3 rounded-lg bg-sage-soft px-3 py-2 text-xs font-semibold text-forest">Add {formatINR(view.freeShippingGapPaise)} more for free shipping.</p>
      )}
      {view.shipping.status === "OK" && (
        <p className="mt-3 text-xs text-muted">
          {[etaText(view.shipping.etaDate, view.shipping.etaDays), `via ${view.shipping.courier}`].filter(Boolean).join(" · ")}
          {view.shipping.simulated && <span className="block font-semibold text-chilli">Test mode: simulated courier rate.</span>}
        </p>
      )}
      {(view.shipping.status === "UNSERVICEABLE" || view.shipping.status === "ERROR") && <p className="mt-3 text-sm font-semibold text-chilli">{view.shipping.message}</p>}
    </div>
  );
}
