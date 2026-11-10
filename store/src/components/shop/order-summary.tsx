import { formatINR } from "@/lib/money";
import { dateLocale, type Locale } from "@/i18n/config";
import { translator } from "@/i18n/translate";
import type { CheckoutView } from "@/server/checkout-view";

export function etaText(etaDate: string | null, etaDays: number | null, lang: Locale = "en") {
  const t = translator(lang);
  if (etaDate) {
    const d = new Date(`${etaDate}T12:00:00+05:30`);
    return t("Estimated delivery by {date}", { date: d.toLocaleDateString(dateLocale(lang), { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) });
  }
  return etaDays ? t(etaDays === 1 ? "Estimated delivery in about {days} day" : "Estimated delivery in about {days} days", { days: etaDays }) : null;
}

/** Totals block shared by the cart and checkout. */
export function Totals({ view, lang = "en" }: { view: CheckoutView; lang?: Locale }) {
  const t = translator(lang);
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-4 ${strong ? "border-t border-line pt-2 text-base font-bold text-forest" : "text-sm"}`}>
      <dt className={strong ? "" : "text-muted"}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  return (
    <div>
      <dl className="space-y-2">
        {row(t("Items"), formatINR(view.subtotalPaise))}
        {view.couponDiscountPaise > 0 && row(`${t("Discount")}${view.couponCode ? ` (${view.couponCode})` : ""}`, `−${formatINR(view.couponDiscountPaise)}`)}
        {view.pointsDiscountPaise > 0 && row(t("Points used"), `−${formatINR(view.pointsDiscountPaise)}`)}
        {row(
          t("Shipping"),
          view.shippingPaise === null ? t(view.shipping.status === "NEED_PINCODE" ? "Enter pincode" : "Not available") : view.shippingPaise === 0 ? t("Free") : formatINR(view.shippingPaise),
        )}
        {view.codFeePaise > 0 && row(t("Cash on delivery fee"), formatINR(view.codFeePaise))}
        {row(t("Total"), view.totalPaise === null ? "—" : formatINR(view.totalPaise), true)}
      </dl>
      {view.taxPaise !== null && view.totalPaise !== null && <p className="mt-1 text-xs text-muted">{t("Includes {amount} GST", { amount: formatINR(view.taxPaise) })}</p>}
      {view.freeShippingGapPaise !== null && view.freeShippingGapPaise > 0 && (
        <p className="mt-3 rounded-lg bg-sage-soft px-3 py-2 text-xs font-semibold text-forest">{t("Add {amount} more for free shipping.", { amount: formatINR(view.freeShippingGapPaise) })}</p>
      )}
      {view.shipping.status === "OK" && (
        <p className="mt-3 text-xs text-muted">
          {[etaText(view.shipping.etaDate, view.shipping.etaDays, lang), t("via {courier}", { courier: view.shipping.courier })].filter(Boolean).join(" · ")}
          {view.shipping.simulated && <span className="block font-semibold text-chilli">{t("Test mode: simulated courier rate.")}</span>}
        </p>
      )}
      {(view.shipping.status === "UNSERVICEABLE" || view.shipping.status === "ERROR") && <p className="mt-3 text-sm font-semibold text-chilli">{t(view.shipping.message)}</p>}
    </div>
  );
}
