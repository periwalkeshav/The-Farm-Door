"use server";

import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { cookieName } from "@/data/cookies";
import { clientIp } from "@/data/request";
import { getCustomer } from "@/data/session";
import { env } from "@/lib/env";
import { isIndianState, isValidGstin, isValidPincode, normalizeIndianMobile } from "@/lib/india";
import { getCartRow } from "@/server/cart";
import { summarizeCart } from "@/server/checkout";
import { toCheckoutView, type CheckoutView } from "@/server/checkout-view";
import { checkOrderToken, orderAccessToken } from "@/server/orders/common";
import { processGatewayPayment } from "@/server/orders/payment";
import { placeOrder, startPayment, type PaymentStart } from "@/server/orders/place";
import { paymentGateway } from "@/server/payments";
import { mockPaymentId, mockSignature } from "@/server/payments/mock";
import { hitRateLimit } from "@/server/rate-limit";
import { shippingProvider } from "@/server/shipping";

async function cartFromCookie() {
  return getCartRow(getDb(), (await cookies()).get(cookieName("cart"))?.value);
}

/** Recalculates the checkout summary for a pincode/payment choice (shown live as the customer fills the form). */
export async function previewCheckoutAction(input: { pincode: string; paymentMethod: "PREPAID" | "COD"; email: string }): Promise<CheckoutView | null> {
  const cart = await cartFromCookie();
  if (!cart) return null;
  const db = getDb();
  if (!(await hitRateLimit(db, `preview:${await clientIp()}`, 120, 600)).allowed) return null;
  const summary = await summarizeCart(db, {
    cartId: cart.id,
    couponCode: cart.couponCode,
    pincode: isValidPincode(input.pincode) ? input.pincode : null,
    paymentMethod: input.paymentMethod === "COD" ? "COD" : "PREPAID",
    email: z.email().safeParse(input.email).success ? input.email : null,
  });
  return toCheckoutView(summary);
}

export async function lookupPincodeAction(pincode: string): Promise<{ city: string; state: string } | null> {
  if (!isValidPincode(pincode)) return null;
  if (!(await hitRateLimit(getDb(), `pinlookup:${await clientIp()}`, 60, 600)).allowed) return null;
  const details = await shippingProvider().postcodeDetails(pincode);
  return details && isIndianState(details.state) ? details : details ? { city: details.city, state: "" } : null;
}

const orderSchema = z.object({
  idempotencyKey: z.uuid(),
  email: z.email("Enter a valid email address.").max(200),
  phone: z.string().transform((v, ctx) => {
    const n = normalizeIndianMobile(v);
    if (!n) ctx.addIssue({ code: "custom", message: "Enter a 10-digit Indian mobile number." });
    return n ?? "";
  }),
  name: z.string().trim().min(2, "Enter the recipient's full name.").max(80),
  line1: z.string().trim().min(5, "Enter the house/flat number and street.").max(200),
  line2: z.string().trim().max(200).default(""),
  landmark: z.string().trim().max(100).default(""),
  city: z.string().trim().min(2, "Enter the city.").max(80),
  state: z.string().refine(isIndianState, "Choose a state."),
  pincode: z.string().refine(isValidPincode, "Enter a valid 6-digit pincode."),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .default("")
    .refine((v) => v === "" || isValidGstin(v), "That GSTIN doesn't look right."),
  businessName: z.string().trim().max(120).default(""),
  paymentMethod: z.enum(["PREPAID", "COD"]),
  expectedTotalPaise: z.coerce.number().int(),
  marketingOptIn: z.boolean().default(false),
  saveAddress: z.boolean().default(false),
  note: z.string().trim().max(300).default(""),
});

export type PlaceOrderState =
  | { ok: true; orderNumber: string; token: string; payment: PaymentStart; email: string; name: string; phone: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string>; view?: CheckoutView | null };

export async function placeOrderAction(input: Record<string, unknown>): Promise<PlaceOrderState> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors };
  }
  const data = parsed.data;
  if (data.gstin && !data.businessName) return { ok: false, message: "Enter the business name for the GST invoice.", fieldErrors: { businessName: "Enter the registered business name." } };

  const db = getDb();
  if (!(await hitRateLimit(db, `place-order:${await clientIp()}`, 15, 600)).allowed) return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  const cart = await cartFromCookie();
  if (!cart) return { ok: false, message: "Your cart is empty." };
  const customer = await getCustomer();

  const result = await placeOrder(db, {
    cartId: cart.id,
    couponCode: cart.couponCode,
    signedInCustomerId: customer?.id ?? null,
    ...data,
  });
  if (!result.ok) return { ok: false, message: result.message, view: result.summary ? toCheckoutView(result.summary) : null };
  // Stale-while-revalidate: refresh product availability without re-rendering this checkout page.
  revalidateTag("stock", "max");
  return { ok: true, orderNumber: result.order.orderNumber, token: result.accessToken, payment: result.payment, email: result.order.email, name: result.order.shipName, phone: result.order.shipPhone };
}

async function orderForToken(orderNumber: string, token: string) {
  const [order] = await getDb().select().from(orders).where(eq(orders.orderNumber, orderNumber));
  if (!order) return null;
  if (checkOrderToken(order, token)) return order;
  const customer = await getCustomer();
  return customer && order.customerId === customer.id ? order : null;
}

/** "Pay now" on an order awaiting payment (retry after a failed or closed payment window). */
export async function startPaymentAction(orderNumber: string, token: string): Promise<{ payment: PaymentStart; email: string; name: string; phone: string } | { error: string }> {
  const order = await orderForToken(orderNumber, token);
  if (!order) return { error: "Order not found." };
  if (order.status !== "AWAITING_PAYMENT") return { error: "This order doesn't need payment." };
  if (order.reservationExpiresAt && order.reservationExpiresAt.getTime() < Date.now()) return { error: "The payment window for this order has closed. Please place a new order." };
  const payment = await startPayment(getDb(), order);
  return { payment, email: order.email, name: order.shipName, phone: order.shipPhone };
}

export type VerifyResult = { ok: boolean; message: string; redirectTo: string };

/**
 * Called by the browser after Razorpay Checkout reports success. We verify the
 * signature, then fetch the payment from Razorpay's API and only confirm the
 * order if Razorpay says it's captured for the right amount.
 */
export async function verifyPaymentAction(input: { orderNumber: string; token: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }): Promise<VerifyResult> {
  const order = await orderForToken(input.orderNumber, input.token);
  if (!order) return { ok: false, message: "Order not found.", redirectTo: "/" };
  const redirectTo = `/orders/${order.orderNumber}?t=${orderAccessToken(order)}`;
  const gateway = paymentGateway();
  if (order.razorpayOrderId !== input.razorpayOrderId || !gateway.verifyCheckoutSignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
    return { ok: false, message: "We couldn't verify this payment. If money was deducted, it will be confirmed or refunded automatically.", redirectTo };
  }
  const payment = await gateway.fetchPayment(input.razorpayPaymentId);
  if (payment.orderId !== order.razorpayOrderId) return { ok: false, message: "Payment doesn't match this order.", redirectTo };
  const result = await processGatewayPayment(getDb(), payment, "checkout");
  revalidateTag("stock", "max");
  const confirmed = ["CONFIRMED", "LATE_CONFIRMED", "ALREADY_APPLIED"].includes(result.outcome);
  return { ok: confirmed, message: confirmed ? "Payment received." : "We're checking your payment. This page will update shortly.", redirectTo };
}

/** DEVELOPMENT ONLY: completes a simulated payment, then runs the same verification path as Razorpay. */
export async function simulatePaymentAction(orderNumber: string, token: string, outcome: "captured" | "failed"): Promise<VerifyResult> {
  if (env().PAYMENTS_PROVIDER !== "mock") return { ok: false, message: "Simulated payments are disabled.", redirectTo: "/" };
  const order = await orderForToken(orderNumber, token);
  if (!order || !order.razorpayOrderId) return { ok: false, message: "Order not found.", redirectTo: "/" };
  const paymentId = mockPaymentId(order.razorpayOrderId, order.totalPaise, outcome);
  if (outcome === "failed") {
    await processGatewayPayment(getDb(), await paymentGateway().fetchPayment(paymentId), "checkout");
    return { ok: false, message: "Simulated payment failed. You can try again.", redirectTo: `/orders/${order.orderNumber}?t=${orderAccessToken(order)}` };
  }
  return verifyPaymentAction({ orderNumber, token, razorpayOrderId: order.razorpayOrderId, razorpayPaymentId: paymentId, razorpaySignature: mockSignature(order.razorpayOrderId, paymentId) });
}
