/**
 * Pure pricing logic: coupons, discount allocation, shipping, COD fee and GST.
 * Shared by the cart, checkout and order creation so the customer always sees
 * exactly what the server will charge. No database access in this file.
 */
import { ceilToRupee } from "./money";

export type PricingLine = {
  variantId: number;
  productId: number;
  categoryId: number | null;
  unitPricePaise: number; // GST-inclusive selling price
  quantity: number;
  gstRateBp: number;
};

export type CouponRule = {
  code: string;
  type: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value: number;
  maxDiscountPaise: number | null;
  minOrderPaise: number;
  scope: "ALL" | "PRODUCTS" | "CATEGORIES";
  productIds: number[];
  categoryIds: number[];
};

export type CouponResult =
  | { ok: true; discountPaise: number; freeShipping: boolean; eligible: boolean[] }
  | { ok: false; reason: string };

export function lineSubtotal(line: PricingLine): number {
  return line.unitPricePaise * line.quantity;
}

export function itemsSubtotal(lines: PricingLine[]): number {
  return lines.reduce((sum, l) => sum + lineSubtotal(l), 0);
}

/** Works out a coupon's discount on the given lines. Date/usage limits are checked by the caller. */
export function evaluateCoupon(coupon: CouponRule, lines: PricingLine[]): CouponResult {
  const subtotal = itemsSubtotal(lines);
  if (subtotal < coupon.minOrderPaise) {
    return { ok: false, reason: `This code needs a minimum order of ₹${Math.ceil(coupon.minOrderPaise / 100)}.` };
  }
  const eligible = lines.map((l) => {
    if (coupon.scope === "ALL") return true;
    if (coupon.scope === "PRODUCTS") return coupon.productIds.includes(l.productId);
    return l.categoryId !== null && coupon.categoryIds.includes(l.categoryId);
  });
  if (!eligible.some(Boolean)) {
    return { ok: false, reason: "This code doesn't apply to the items in your cart." };
  }
  if (coupon.type === "FREE_SHIPPING") {
    return { ok: true, discountPaise: 0, freeShipping: true, eligible };
  }
  const eligibleSubtotal = lines.reduce((sum, l, i) => (eligible[i] ? sum + lineSubtotal(l) : sum), 0);
  let discount =
    coupon.type === "PERCENT" ? Math.floor((eligibleSubtotal * coupon.value) / 10_000) : Math.min(coupon.value, eligibleSubtotal);
  if (coupon.maxDiscountPaise !== null) discount = Math.min(discount, coupon.maxDiscountPaise);
  discount = Math.max(0, Math.min(discount, eligibleSubtotal));
  return { ok: true, discountPaise: discount, freeShipping: false, eligible };
}

/**
 * Splits a discount across eligible lines in proportion to their value
 * (largest-remainder method), so the per-line amounts add up exactly.
 */
export function allocateDiscount(subtotals: number[], eligible: boolean[], discount: number): number[] {
  const base = subtotals.map((s, i) => (eligible[i] ? s : 0));
  const total = base.reduce((a, b) => a + b, 0);
  if (discount <= 0 || total <= 0) return subtotals.map(() => 0);
  const exact = base.map((s) => (s * discount) / total);
  const floored = exact.map(Math.floor);
  let remainder = discount - floored.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .filter(({ index }) => base[index] > 0)
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floored[index] += 1;
    remainder -= 1;
  }
  return floored;
}

/** GST included in a GST-inclusive amount. */
export function splitInclusiveTax(amountPaise: number, rateBp: number): { taxable: number; tax: number } {
  if (rateBp <= 0) return { taxable: amountPaise, tax: 0 };
  const taxable = Math.round((amountPaise * 10_000) / (10_000 + rateBp));
  return { taxable, tax: amountPaise - taxable };
}

/** Splits GST into CGST+SGST (same state) or IGST (different state). */
export function splitGst(taxPaise: number, intraState: boolean) {
  if (!intraState) return { cgst: 0, sgst: 0, igst: taxPaise };
  const cgst = Math.floor(taxPaise / 2);
  return { cgst, sgst: taxPaise - cgst, igst: 0 };
}

export type ShippingInput = {
  /** Courier's quoted cost for this parcel, or null when no quote is available yet. */
  quotedCostPaise: number | null;
  /** Free shipping when the discounted item total reaches this amount; null disables. */
  freeShippingThresholdPaise: number | null;
  /** Optional flat amount added to the courier quote (handling). Defaults to 0. */
  handlingFeePaise?: number;
};

export type CodInput = { selected: boolean; feePaise: number };

export type PricedLine = PricingLine & {
  subtotalPaise: number;
  discountPaise: number;
  totalPaise: number;
  taxablePaise: number;
  taxPaise: number;
};

export type PriceBreakdown = {
  lines: PricedLine[];
  subtotalPaise: number;
  /** All discounts: coupon plus loyalty points. */
  discountPaise: number;
  couponDiscountPaise: number;
  pointsDiscountPaise: number;
  itemsTotalPaise: number;
  freeShipping: boolean;
  freeShippingReason: "COUPON" | "THRESHOLD" | null;
  shippingPaise: number | null; // null = needs a pincode / quote
  codFeePaise: number;
  totalPaise: number | null;
  taxPaise: number | null;
  /** GST rate used for shipping/COD charges: the rate of the order's main item (composite supply). */
  chargesGstRateBp: number;
  /** Amount still needed for free shipping, if a threshold is set and not yet reached. */
  freeShippingGapPaise: number | null;
};

export function priceOrder(
  lines: PricingLine[],
  coupon: { rule: CouponRule; result: Extract<CouponResult, { ok: true }> } | null,
  shipping: ShippingInput,
  cod: CodInput,
  /** Loyalty points used, in rupee value. Applied after the coupon, across all items. */
  pointsDiscountPaise = 0,
): PriceBreakdown {
  const subtotals = lines.map(lineSubtotal);
  const couponDiscount = coupon ? coupon.result.discountPaise : 0;
  const couponAllocation = coupon ? allocateDiscount(subtotals, coupon.result.eligible, couponDiscount) : subtotals.map(() => 0);
  const afterCoupon = subtotals.map((s, i) => s - couponAllocation[i]);
  const points = Math.max(0, Math.min(Math.floor(pointsDiscountPaise), afterCoupon.reduce((a, b) => a + b, 0)));
  const pointsAllocation = allocateDiscount(afterCoupon, afterCoupon.map(() => true), points);
  const allocation = subtotals.map((_, i) => couponAllocation[i] + pointsAllocation[i]);
  const discount = couponDiscount + points;

  const priced: PricedLine[] = lines.map((line, i) => {
    const total = subtotals[i] - allocation[i];
    const { taxable, tax } = splitInclusiveTax(total, line.gstRateBp);
    return { ...line, subtotalPaise: subtotals[i], discountPaise: allocation[i], totalPaise: total, taxablePaise: taxable, taxPaise: tax };
  });

  const subtotal = subtotals.reduce((a, b) => a + b, 0);
  const itemsTotal = subtotal - discount;

  const couponFree = coupon?.result.freeShipping ?? false;
  const threshold = shipping.freeShippingThresholdPaise;
  // Paying with points shouldn't cost the customer their free shipping, so the threshold uses the total before points.
  const thresholdBase = subtotal - couponDiscount;
  const thresholdFree = threshold !== null && thresholdBase >= threshold;
  const freeShipping = couponFree || thresholdFree;

  let shippingPaise: number | null;
  if (freeShipping) shippingPaise = 0;
  else if (shipping.quotedCostPaise === null) shippingPaise = null;
  else shippingPaise = ceilToRupee(shipping.quotedCostPaise + (shipping.handlingFeePaise ?? 0));

  const codFee = cod.selected ? cod.feePaise : 0;

  const principal = priced.reduce<PricedLine | null>(
    (best, l) => (!best || l.totalPaise > best.totalPaise || (l.totalPaise === best.totalPaise && l.gstRateBp > best.gstRateBp) ? l : best),
    null,
  );
  const chargesRate = principal?.gstRateBp ?? 0;

  const itemsTax = priced.reduce((sum, l) => sum + l.taxPaise, 0);
  let total: number | null = null;
  let tax: number | null = null;
  if (shippingPaise !== null) {
    total = itemsTotal + shippingPaise + codFee;
    tax = itemsTax + splitInclusiveTax(shippingPaise + codFee, chargesRate).tax;
  }

  return {
    lines: priced,
    subtotalPaise: subtotal,
    discountPaise: discount,
    couponDiscountPaise: couponDiscount,
    pointsDiscountPaise: points,
    itemsTotalPaise: itemsTotal,
    freeShipping,
    freeShippingReason: couponFree ? "COUPON" : thresholdFree ? "THRESHOLD" : null,
    shippingPaise,
    codFeePaise: codFee,
    totalPaise: total,
    taxPaise: tax,
    chargesGstRateBp: chargesRate,
    freeShippingGapPaise: threshold !== null && !freeShipping ? threshold - thresholdBase : null,
  };
}
