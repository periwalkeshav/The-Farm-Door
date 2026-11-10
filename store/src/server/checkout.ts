/**
 * One function builds the cart/checkout summary — lines, stock issues, coupon,
 * courier quote, COD eligibility and totals — so the cart page, the checkout
 * page and order placement can never disagree about what the customer pays.
 */
import type { DbOrTx } from "@/db";
import { isValidPincode, normalizeEmail } from "@/lib/india";
import { priceOrder, type PriceBreakdown } from "@/lib/pricing";
import { cartIssues, cartWeightGrams, loadCartLines, toPricingLines, type CartIssue, type CartLine } from "./cart";
import { checkCoupon, type CouponCheck } from "./coupons";
import { usablePoints } from "./loyalty";
import { readSettings, type SettingsValue } from "./settings";
import { parcelWeight, quoteShipping, type ShippingQuote } from "./shipping";

export type PaymentChoice = "PREPAID" | "COD";

export type CheckoutSummary = {
  lines: CartLine[];
  issues: CartIssue[];
  couponCode: string | null;
  coupon: CouponCheck | null;
  breakdown: PriceBreakdown;
  pincode: string | null;
  quote: ShippingQuote | null;
  parcelWeightGrams: number;
  paymentMethod: PaymentChoice;
  cod: { offered: boolean; available: boolean; reason: string | null; feePaise: number };
  settings: { shipping: SettingsValue<"shipping">; cod: SettingsValue<"cod"> };
  /** Loyalty points this (signed-in) customer can use here, and whether they're being used. */
  points: { enabled: boolean; balance: number; usable: number; valuePaise: number; applied: boolean; minToRedeem: number };
};

export async function summarizeCart(
  db: DbOrTx,
  input: { cartId: string; couponCode: string | null; pincode: string | null; paymentMethod: PaymentChoice; email: string | null; customerId?: number | null; usePoints?: boolean },
): Promise<CheckoutSummary> {
  const [shipping, cod, loyalty] = await Promise.all([readSettings(db, "shipping"), readSettings(db, "cod"), readSettings(db, "loyalty")]);
  const lines = await loadCartLines(db, input.cartId);
  const issues = cartIssues(lines);
  const pricingLines = toPricingLines(lines);
  const email = input.email ? normalizeEmail(input.email) : null;

  const coupon = input.couponCode && lines.length ? await checkCoupon(db, input.couponCode, pricingLines, email) : null;
  const applied = coupon?.ok ? { rule: coupon.rule, result: coupon.result } : null;

  const pincode = input.pincode && isValidPincode(input.pincode) ? input.pincode : null;
  const weight = parcelWeight(cartWeightGrams(lines), shipping);

  // COD rules that don't depend on the courier.
  const pincodeBlocked = pincode !== null && cod.blockedPincodes.includes(pincode);
  const prepaidPreview = priceOrder(pricingLines, applied, { quotedCostPaise: 0, freeShippingThresholdPaise: shipping.freeShippingThresholdPaise }, { selected: false, feePaise: 0 });
  const pts = await usablePoints(db, input.customerId ?? null, prepaidPreview.itemsTotalPaise, loyalty);
  const pointsUsed = input.usePoints ? pts.usable : 0;
  const pointsDiscount = pointsUsed * loyalty.pointValuePaise;
  let codReason: string | null = null;
  if (!cod.enabled) codReason = "Cash on delivery isn't available right now.";
  else if (pincodeBlocked) codReason = "Cash on delivery isn't available for this pincode.";
  else if (cod.maxOrderPaise !== null && prepaidPreview.itemsTotalPaise + cod.feePaise > cod.maxOrderPaise) {
    codReason = `Cash on delivery is available for orders up to ₹${Math.floor(cod.maxOrderPaise / 100)}.`;
  }

  let paymentMethod: PaymentChoice = input.paymentMethod === "COD" && !codReason ? "COD" : "PREPAID";
  let quote: ShippingQuote | null = null;
  if (pincode && lines.length) {
    quote = await quoteShipping({ deliveryPincode: pincode, weightGrams: weight, cod: paymentMethod === "COD", declaredValuePaise: prepaidPreview.itemsTotalPaise, shipping });
    if (quote.status === "COD_UNAVAILABLE") {
      codReason = "Cash on delivery isn't available for this pincode.";
      paymentMethod = "PREPAID";
      quote = await quoteShipping({ deliveryPincode: pincode, weightGrams: weight, cod: false, declaredValuePaise: prepaidPreview.itemsTotalPaise, shipping });
    }
  }

  const breakdown = priceOrder(
    pricingLines,
    applied,
    {
      quotedCostPaise: quote?.status === "OK" ? quote.courier.costPaise : null,
      freeShippingThresholdPaise: shipping.freeShippingThresholdPaise,
      handlingFeePaise: shipping.handlingFeePaise,
    },
    { selected: paymentMethod === "COD", feePaise: cod.feePaise },
    pointsDiscount,
  );

  // The COD limit applies to the final amount including shipping.
  if (paymentMethod === "COD" && cod.maxOrderPaise !== null && breakdown.totalPaise !== null && breakdown.totalPaise > cod.maxOrderPaise) {
    return summarizeCart(db, { ...input, paymentMethod: "PREPAID" }).then((s) => ({
      ...s,
      cod: { ...s.cod, available: false, reason: `Cash on delivery is available for orders up to ₹${Math.floor(cod.maxOrderPaise! / 100)}.` },
    }));
  }

  return {
    lines,
    issues,
    couponCode: input.couponCode,
    coupon,
    breakdown,
    pincode,
    quote,
    parcelWeightGrams: weight,
    paymentMethod,
    cod: { offered: cod.enabled, available: codReason === null, reason: codReason, feePaise: cod.feePaise },
    settings: { shipping, cod },
    points: { enabled: loyalty.pointsEnabled && !!input.customerId, balance: pts.balance, usable: pts.usable, valuePaise: pts.valuePaise, applied: pointsUsed > 0, minToRedeem: loyalty.minPointsToRedeem },
  };
}
