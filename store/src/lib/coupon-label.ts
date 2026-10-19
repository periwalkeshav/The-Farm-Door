import type { coupons } from "@/db/schema";
import { formatINR } from "./money";

/** "10% off (max ₹200) · min ₹499" */
export function describeCoupon(c: typeof coupons.$inferSelect) {
  const what = c.type === "PERCENT" ? `${c.value / 100}% off${c.maxDiscountPaise ? ` (max ${formatINR(c.maxDiscountPaise)})` : ""}` : c.type === "FIXED" ? `${formatINR(c.value)} off` : "Free shipping";
  const where = c.scope === "ALL" ? "" : c.scope === "PRODUCTS" ? ` on ${c.productIds.length} product(s)` : ` on ${c.categoryIds.length} categor${c.categoryIds.length === 1 ? "y" : "ies"}`;
  return `${what}${where}${c.minOrderPaise ? ` · min ${formatINR(c.minOrderPaise)}` : ""}`;
}
