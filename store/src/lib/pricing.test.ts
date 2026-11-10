import { describe, expect, it } from "vitest";
import { allocateDiscount, evaluateCoupon, priceOrder, splitGst, splitInclusiveTax, type CouponRule, type PricingLine } from "./pricing";

const line = (over: Partial<PricingLine> = {}): PricingLine => ({
  variantId: 1,
  productId: 1,
  categoryId: 1,
  unitPricePaise: 24_900,
  quantity: 1,
  gstRateBp: 500,
  ...over,
});

const coupon = (over: Partial<CouponRule> = {}): CouponRule => ({
  code: "TEST",
  type: "PERCENT",
  value: 1000,
  maxDiscountPaise: null,
  minOrderPaise: 0,
  scope: "ALL",
  productIds: [],
  categoryIds: [],
  ...over,
});

describe("GST", () => {
  it("extracts 5% GST from an inclusive price", () => {
    expect(splitInclusiveTax(10_500, 500)).toEqual({ taxable: 10_000, tax: 500 });
  });
  it("taxable + tax always equals the inclusive amount", () => {
    for (const amount of [1, 99, 24_900, 33_333, 1_234_567]) {
      for (const rate of [0, 500, 1200, 1800]) {
        const { taxable, tax } = splitInclusiveTax(amount, rate);
        expect(taxable + tax).toBe(amount);
      }
    }
  });
  it("splits CGST/SGST within the state and IGST across states", () => {
    expect(splitGst(501, true)).toEqual({ cgst: 250, sgst: 251, igst: 0 });
    expect(splitGst(501, false)).toEqual({ cgst: 0, sgst: 0, igst: 501 });
  });
});

describe("discount allocation", () => {
  it("adds up exactly and favours lines with larger remainders", () => {
    const parts = allocateDiscount([100, 100, 100], [true, true, true], 100);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });
  it("skips ineligible lines", () => {
    expect(allocateDiscount([500, 500], [true, false], 50)).toEqual([50, 0]);
  });
});

describe("coupons", () => {
  it("applies a percentage with a cap", () => {
    const r = evaluateCoupon(coupon({ value: 2000, maxDiscountPaise: 5_000 }), [line({ unitPricePaise: 50_000 })]);
    expect(r).toMatchObject({ ok: true, discountPaise: 5_000 });
  });
  it("never discounts more than the eligible amount", () => {
    const r = evaluateCoupon(coupon({ type: "FIXED", value: 99_999 }), [line()]);
    expect(r).toMatchObject({ ok: true, discountPaise: 24_900 });
  });
  it("enforces the minimum order", () => {
    const r = evaluateCoupon(coupon({ minOrderPaise: 50_000 }), [line()]);
    expect(r.ok).toBe(false);
  });
  it("limits product-scoped coupons to those products", () => {
    const lines = [line({ productId: 1, unitPricePaise: 10_000 }), line({ variantId: 2, productId: 2, unitPricePaise: 30_000 })];
    const r = evaluateCoupon(coupon({ scope: "PRODUCTS", productIds: [2] }), lines);
    expect(r).toMatchObject({ ok: true, discountPaise: 3_000 });
    const none = evaluateCoupon(coupon({ scope: "PRODUCTS", productIds: [9] }), lines);
    expect(none.ok).toBe(false);
  });
});

describe("priceOrder", () => {
  it("needs a courier quote before it can total", () => {
    const b = priceOrder([line()], null, { quotedCostPaise: null, freeShippingThresholdPaise: null }, { selected: false, feePaise: 0 });
    expect(b.shippingPaise).toBeNull();
    expect(b.totalPaise).toBeNull();
  });
  it("charges the courier quote rounded up to the rupee, plus COD fee", () => {
    const b = priceOrder([line({ quantity: 2 })], null, { quotedCostPaise: 6_712, freeShippingThresholdPaise: null }, { selected: true, feePaise: 4_000 });
    expect(b.shippingPaise).toBe(6_800);
    expect(b.totalPaise).toBe(49_800 + 6_800 + 4_000);
  });
  it("gives free shipping at the threshold, measured after discount", () => {
    const rule = coupon({ value: 1000 });
    const lines = [line({ unitPricePaise: 50_000 })];
    const result = evaluateCoupon(rule, lines);
    if (!result.ok) throw new Error("expected coupon to apply");
    const below = priceOrder(lines, { rule, result }, { quotedCostPaise: 7_000, freeShippingThresholdPaise: 50_000 }, { selected: false, feePaise: 0 });
    expect(below.shippingPaise).toBe(7_000);
    expect(below.freeShippingGapPaise).toBe(5_000);
    const above = priceOrder([line({ unitPricePaise: 60_000 })], null, { quotedCostPaise: 7_000, freeShippingThresholdPaise: 50_000 }, { selected: false, feePaise: 0 });
    expect(above.shippingPaise).toBe(0);
    expect(above.freeShippingReason).toBe("THRESHOLD");
  });
  it("line totals always add up to the discounted item total", () => {
    const rule = coupon({ value: 1500 });
    const lines = [line({ unitPricePaise: 12_345, quantity: 3 }), line({ variantId: 2, unitPricePaise: 9_999, gstRateBp: 1200 })];
    const result = evaluateCoupon(rule, lines);
    if (!result.ok) throw new Error("expected coupon to apply");
    const b = priceOrder(lines, { rule, result }, { quotedCostPaise: 5_000, freeShippingThresholdPaise: null }, { selected: false, feePaise: 0 });
    expect(b.lines.reduce((s, l) => s + l.totalPaise, 0)).toBe(b.itemsTotalPaise);
    expect(b.totalPaise).toBe(b.itemsTotalPaise + 5_000);
  });
});

describe("loyalty points discount", () => {
  const lines = [
    { variantId: 1, productId: 1, categoryId: null, unitPricePaise: 30_000, quantity: 1, gstRateBp: 500 },
    { variantId: 2, productId: 2, categoryId: null, unitPricePaise: 10_000, quantity: 1, gstRateBp: 1200 },
  ];
  const shipping = { quotedCostPaise: 6_000, freeShippingThresholdPaise: 40_000 };

  it("is spread across items after the coupon, so GST is on the reduced price", () => {
    const b = priceOrder(lines, null, shipping, { selected: false, feePaise: 0 }, 4_000);
    expect(b).toMatchObject({ discountPaise: 4_000, pointsDiscountPaise: 4_000, couponDiscountPaise: 0, itemsTotalPaise: 36_000 });
    expect(b.lines.map((l) => l.discountPaise)).toEqual([3_000, 1_000]);
    expect(b.lines.reduce((s, l) => s + l.totalPaise, 0)).toBe(36_000);
  });

  it("keeps free shipping earned before points, and never exceeds the items total", () => {
    const b = priceOrder(lines, null, shipping, { selected: false, feePaise: 0 }, 99_999);
    expect(b.pointsDiscountPaise).toBe(40_000);
    expect(b.freeShipping).toBe(true);
    expect(b.totalPaise).toBe(0);
  });
});
