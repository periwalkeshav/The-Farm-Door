/**
 * Placing an order.
 *
 * Everything the customer pays is recalculated here from the database (prices,
 * coupon, courier quote, COD fee). If the result differs from what the checkout
 * page showed, the order is not created and the customer sees the new total.
 *
 * In one transaction: create the order and its lines, hold the stock, claim the
 * coupon use and clear the cart. Then, outside the transaction, create the
 * Razorpay order (prepaid) or email the COD confirmation link.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db";
import { addresses, couponRedemptions, newsletterSubscribers, orderItems, orders } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { normalizeEmail } from "@/lib/india";
import { clearCart } from "../cart";
import { summarizeCart, type CheckoutSummary } from "../checkout";
import { claimCouponUse } from "../coupons";
import { nextOrderNumber } from "../counters";
import { sendEmail } from "../email/send";
import { codConfirmEmail } from "../email/templates";
import { aggregateNeeds, OutOfStockError, reserveStock } from "../inventory";
import { paymentGateway } from "../payments";
import { readSettings } from "../settings";
import { upsertCustomerByEmail } from "../auth/customer";
import { PointsChangedError, redeemPoints } from "../loyalty";
import { notifyWhatsApp } from "../whatsapp";
import { addOrderEvent, codConfirmToken, emailOrder, orderAccessToken, orderUrl, type OrderRow } from "./common";

export type PlaceOrderInput = {
  cartId: string;
  couponCode: string | null;
  signedInCustomerId: number | null;
  idempotencyKey: string;
  email: string;
  phone: string;
  name: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  businessName: string;
  paymentMethod: "PREPAID" | "COD";
  expectedTotalPaise: number;
  marketingOptIn: boolean;
  saveAddress: boolean;
  note: string;
  /** The customer asked for WhatsApp order updates. */
  whatsappOptIn?: boolean;
  /** Use loyalty points (signed-in customers only). */
  usePoints?: boolean;
};

export type PaymentStart = { provider: "razorpay" | "mock"; keyId: string; razorpayOrderId: string; amountPaise: number } | null;

export type PlaceOrderResult =
  | { ok: true; order: OrderRow; accessToken: string; payment: PaymentStart; existing: boolean }
  | { ok: false; code: "EMPTY" | "ISSUES" | "NO_SHIPPING" | "PRICE_CHANGED" | "OUT_OF_STOCK" | "COUPON" | "COD_UNAVAILABLE"; message: string; summary?: CheckoutSummary };

export async function placeOrder(db: Database, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  // A double-click or retried request returns the order already created for this checkout.
  const [already] = await db.select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey));
  if (already) return { ok: true, order: already, accessToken: orderAccessToken(already), payment: await startPayment(db, already), existing: true };

  const email = normalizeEmail(input.email);
  const summary = await summarizeCart(db, {
    cartId: input.cartId,
    couponCode: input.couponCode,
    pincode: input.pincode,
    paymentMethod: input.paymentMethod,
    email,
    customerId: input.signedInCustomerId,
    usePoints: !!input.usePoints && !!input.signedInCustomerId,
  });

  if (summary.lines.length === 0) return { ok: false, code: "EMPTY", message: "Your cart is empty." };
  if (summary.issues.length) return { ok: false, code: "ISSUES", message: "Some items in your cart need attention.", summary };
  if (summary.couponCode && summary.coupon && !summary.coupon.ok) return { ok: false, code: "COUPON", message: summary.coupon.reason, summary };
  if (input.paymentMethod === "COD" && summary.paymentMethod !== "COD") {
    return { ok: false, code: "COD_UNAVAILABLE", message: summary.cod.reason ?? "Cash on delivery isn't available for this order.", summary };
  }
  const quote = summary.quote;
  const b = summary.breakdown;
  if (!quote || quote.status !== "OK" || b.totalPaise === null || b.shippingPaise === null || b.taxPaise === null) {
    const message =
      quote?.status === "UNSERVICEABLE"
        ? "Sorry, we can't deliver to this pincode yet."
        : quote?.status === "ERROR"
          ? quote.message
          : "We couldn't work out shipping for this pincode.";
    return { ok: false, code: "NO_SHIPPING", message, summary };
  }
  if (b.totalPaise !== input.expectedTotalPaise) {
    return { ok: false, code: "PRICE_CHANGED", message: "Prices or shipping changed since you opened checkout. Please review the new total.", summary };
  }

  const settings = { checkout: await readSettings(db, "checkout"), cod: summary.settings.cod };
  const isCod = input.paymentMethod === "COD";
  const now = new Date();

  let order: OrderRow;
  try {
    order = await db.transaction(async (tx) => {
      const customerId = input.signedInCustomerId ?? (await upsertCustomerByEmail(tx, email, { name: input.name, phone: input.phone }));
      const orderNumber = await nextOrderNumber(tx);

      const [created] = await tx
        .insert(orders)
        .values({
          orderNumber,
          accessTokenHash: "pending",
          idempotencyKey: input.idempotencyKey,
          customerId,
          email,
          phone: input.phone,
          status: isCod ? "AWAITING_COD_CONFIRMATION" : "AWAITING_PAYMENT",
          paymentMethod: input.paymentMethod,
          paymentStatus: isCod ? "COD_PENDING" : "PENDING",
          stockState: "RESERVED",
          shipName: input.name,
          shipPhone: input.phone,
          shipLine1: input.line1,
          shipLine2: input.line2,
          shipLandmark: input.landmark,
          shipCity: input.city,
          shipState: input.state,
          shipPincode: input.pincode,
          billingGstin: input.gstin,
          billingBusinessName: input.businessName,
          subtotalPaise: b.subtotalPaise,
          discountPaise: b.discountPaise,
          shippingPaise: b.shippingPaise!,
          codFeePaise: b.codFeePaise,
          totalPaise: b.totalPaise!,
          taxPaise: b.taxPaise!,
          pointsRedeemed: summary.points.applied ? summary.points.usable : 0,
          pointsDiscountPaise: b.pointsDiscountPaise,
          couponId: summary.coupon?.ok ? summary.coupon.coupon.id : null,
          couponCode: summary.coupon?.ok ? summary.coupon.coupon.code : null,
          shippingQuote: {
            provider: quote.provider,
            courierId: quote.courier.courierId,
            courierName: quote.courier.name,
            chargePaise: b.shippingPaise!,
            quotedCostPaise: quote.courier.costPaise,
            etaDays: quote.courier.etaDays,
            etaDate: quote.courier.etaDate,
            quotedAt: quote.quotedAt,
          },
          totalWeightGrams: summary.parcelWeightGrams,
          reservationExpiresAt: new Date(now.getTime() + (isCod ? settings.cod.confirmationHours * 3600_000 : settings.checkout.reservationMinutes * 60_000)),
          customerNote: input.note,
          marketingOptIn: input.marketingOptIn,
          whatsappOptIn: !!input.whatsappOptIn,
        })
        .returning();

      const accessTokenHash = sha256Hex(orderAccessToken(created));
      const codConfirmTokenHash = isCod ? sha256Hex(codConfirmToken(created)) : null;
      const [withTokens] = await tx.update(orders).set({ accessTokenHash, codConfirmTokenHash }).where(eq(orders.id, created.id)).returning();

      await tx.insert(orderItems).values(
        b.lines.map((l, i) => {
          const line = summary.lines[i];
          const cost =
            line.unitCostPaise === null ? null : line.poolUnit === "PACK" ? line.unitCostPaise * l.quantity : Math.round((line.unitCostPaise * line.unitsPerSale * l.quantity) / 1000);
          return {
            orderId: created.id,
            productId: line.productId,
            variantId: line.variantId,
            inventoryItemId: line.inventoryItemId,
            unitsPerSale: line.unitsPerSale,
            productName: line.productName,
            variantTitle: line.variantTitle,
            sku: line.sku,
            hsnCode: line.hsnCode,
            gstRateBp: line.gstRateBp,
            unitPricePaise: line.unitPricePaise,
            mrpPaise: line.mrpPaise,
            quantity: l.quantity,
            lineSubtotalPaise: l.subtotalPaise,
            discountPaise: l.discountPaise,
            lineTotalPaise: l.totalPaise,
            taxableValuePaise: l.taxablePaise,
            taxPaise: l.taxPaise,
            costPaise: cost,
            categoryId: line.categoryId,
          };
        }),
      );

      await reserveStock(
        tx,
        aggregateNeeds(summary.lines.map((l) => ({ inventoryItemId: l.inventoryItemId, unitsPerSale: l.unitsPerSale, quantity: l.quantity }))),
        created.id,
      );

      if (summary.coupon?.ok) {
        if (!(await claimCouponUse(tx, summary.coupon.coupon.id))) throw new CouponUsedUp();
        await tx.insert(couponRedemptions).values({ couponId: summary.coupon.coupon.id, orderId: created.id, email, discountPaise: b.couponDiscountPaise });
      }
      if (summary.points.applied) await redeemPoints(tx, input.signedInCustomerId!, created.id, summary.points.usable);

      if (input.saveAddress && input.signedInCustomerId) {
        const [dupe] = await tx
          .select({ id: addresses.id })
          .from(addresses)
          .where(and(eq(addresses.customerId, input.signedInCustomerId), eq(addresses.line1, input.line1), eq(addresses.pincode, input.pincode)));
        if (!dupe) {
          await tx.insert(addresses).values({
            customerId: input.signedInCustomerId,
            name: input.name,
            phone: input.phone,
            line1: input.line1,
            line2: input.line2,
            landmark: input.landmark,
            city: input.city,
            state: input.state,
            pincode: input.pincode,
          });
        }
      }

      if (input.marketingOptIn) {
        await tx.insert(newsletterSubscribers).values({ email, source: "checkout" }).onConflictDoUpdate({
          target: newsletterSubscribers.email,
          set: { unsubscribedAt: null, consentedAt: now },
        });
      }

      await addOrderEvent(tx, created.id, "placed", isCod ? "Order placed (cash on delivery). Waiting for the customer to confirm." : "Order placed. Waiting for online payment.", {
        isPublic: true,
        actor: "customer",
      });
      await clearCart(tx, input.cartId);
      return withTokens;
    });
  } catch (err) {
    if (err instanceof OutOfStockError) {
      const fresh = await summarizeCart(db, { cartId: input.cartId, couponCode: input.couponCode, pincode: input.pincode, paymentMethod: input.paymentMethod, email, customerId: input.signedInCustomerId, usePoints: input.usePoints });
      return { ok: false, code: "OUT_OF_STOCK", message: "Someone just bought the last of an item in your cart. Please review your cart.", summary: fresh };
    }
    if (err instanceof CouponUsedUp) return { ok: false, code: "COUPON", message: "That code has just been fully used." };
    if (err instanceof PointsChangedError) {
      const fresh = await summarizeCart(db, { cartId: input.cartId, couponCode: input.couponCode, pincode: input.pincode, paymentMethod: input.paymentMethod, email, customerId: input.signedInCustomerId, usePoints: input.usePoints });
      return { ok: false, code: "PRICE_CHANGED", message: err.message, summary: fresh };
    }
    throw err;
  }

  if (isCod) {
    const rendered = codConfirmEmail(await emailOrder(db, order), `${orderUrl(order)}&confirm=${codConfirmToken(order)}`, settings.cod.confirmationHours);
    await sendEmail(db, { to: order.email, ...rendered, template: "cod-confirm", orderId: order.id });
    await notifyWhatsApp(db, order, "cod_confirm", { link: `${orderUrl(order)}&confirm=${codConfirmToken(order)}` });
  }

  return { ok: true, order, accessToken: orderAccessToken(order), payment: await startPayment(db, order), existing: false };
}

class CouponUsedUp extends Error {}

/**
 * Creates (once) the gateway order for a prepaid order still awaiting payment,
 * so the customer can pay or retry. Returns null when no payment is needed.
 */
export async function startPayment(db: Database, order: OrderRow): Promise<PaymentStart> {
  if (order.paymentMethod !== "PREPAID" || order.status !== "AWAITING_PAYMENT") return null;
  const gateway = paymentGateway();
  let razorpayOrderId = order.razorpayOrderId;
  if (!razorpayOrderId) {
    const created = await gateway.createOrder(order.totalPaise, order.orderNumber, { order_number: order.orderNumber, order_id: String(order.id) });
    // Another request may have created one at the same time; keep whichever was saved first.
    const [updated] = await db
      .update(orders)
      .set({ razorpayOrderId: created.id })
      .where(and(eq(orders.id, order.id), eq(orders.status, "AWAITING_PAYMENT"), isNull(orders.razorpayOrderId)))
      .returning({ razorpayOrderId: orders.razorpayOrderId });
    if (updated?.razorpayOrderId) razorpayOrderId = updated.razorpayOrderId;
    else {
      const [current] = await db.select({ razorpayOrderId: orders.razorpayOrderId, status: orders.status }).from(orders).where(eq(orders.id, order.id));
      if (!current?.razorpayOrderId || current.status !== "AWAITING_PAYMENT") return null;
      razorpayOrderId = current.razorpayOrderId;
    }
  }
  return { provider: gateway.name, keyId: gateway.publicKeyId(), razorpayOrderId, amountPaise: order.totalPaise };
}
