/**
 * Plain, serialisable view of a checkout summary for the browser. Nothing here
 * is trusted on the way back: the server recalculates everything on submit.
 */
import { mediaUrl } from "@/lib/media-url";
import type { CheckoutSummary } from "./checkout";

export type CheckoutView = {
  lines: {
    variantId: number;
    productSlug: string;
    productName: string;
    variantTitle: string;
    image: string | null;
    quantity: number;
    unitPricePaise: number;
    mrpPaise: number;
    lineTotalPaise: number;
    sellable: number;
    issue: string | null;
  }[];
  hasIssues: boolean;
  couponCode: string | null;
  couponMessage: string | null;
  couponOk: boolean;
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number | null;
  codFeePaise: number;
  totalPaise: number | null;
  taxPaise: number | null;
  freeShipping: boolean;
  freeShippingGapPaise: number | null;
  pincode: string | null;
  shipping:
    | { status: "NEED_PINCODE" }
    | { status: "OK"; courier: string; etaDate: string | null; etaDays: number | null; simulated: boolean }
    | { status: "UNSERVICEABLE" | "ERROR"; message: string };
  paymentMethod: "PREPAID" | "COD";
  cod: { offered: boolean; available: boolean; reason: string | null; feePaise: number };
};

export function toCheckoutView(s: CheckoutSummary): CheckoutView {
  const issues = new Map(s.issues.map((i) => [i.variantId, i.message]));
  const q = s.quote;
  return {
    lines: s.lines.map((l, i) => ({
      variantId: l.variantId,
      productSlug: l.productSlug,
      productName: l.productName,
      variantTitle: l.variantTitle,
      image: mediaUrl(l.imageId, "thumb"),
      quantity: l.quantity,
      unitPricePaise: l.unitPricePaise,
      mrpPaise: l.mrpPaise,
      lineTotalPaise: s.breakdown.lines[i]?.subtotalPaise ?? l.unitPricePaise * l.quantity,
      sellable: l.sellable,
      issue: issues.get(l.variantId) ?? null,
    })),
    hasIssues: s.issues.length > 0,
    couponCode: s.couponCode,
    couponMessage: s.coupon ? (s.coupon.ok ? (s.coupon.coupon.description || null) : s.coupon.reason) : null,
    couponOk: !!s.coupon?.ok,
    subtotalPaise: s.breakdown.subtotalPaise,
    discountPaise: s.breakdown.discountPaise,
    shippingPaise: s.breakdown.shippingPaise,
    codFeePaise: s.breakdown.codFeePaise,
    totalPaise: s.breakdown.totalPaise,
    taxPaise: s.breakdown.taxPaise,
    freeShipping: s.breakdown.freeShipping,
    freeShippingGapPaise: s.breakdown.freeShippingGapPaise,
    pincode: s.pincode,
    shipping: !s.pincode
      ? { status: "NEED_PINCODE" }
      : !q
        ? { status: "NEED_PINCODE" }
        : q.status === "OK"
          ? { status: "OK", courier: q.courier.name, etaDate: q.courier.etaDate, etaDays: q.courier.etaDays, simulated: q.provider === "mock" }
          : q.status === "ERROR"
            ? { status: "ERROR", message: q.message }
            : { status: "UNSERVICEABLE", message: "Sorry, we can't deliver to this pincode yet." },
    paymentMethod: s.paymentMethod,
    cod: s.cod,
  };
}
