/**
 * SIMULATED payment gateway for local development and automated tests only.
 * No money moves. The checkout shows "Simulated payment (test)" buttons instead
 * of Razorpay. env() refuses to start with this in production.
 *
 * Simulated payments are kept in the database-free form of a signed id:
 *   mockpay_<orderId>_<amount>_<outcome>_<nonce>
 * so verification works across server restarts.
 */
import { createHmac, randomBytes } from "node:crypto";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { GatewayPayment, PaymentGateway } from "./types";

const refunded = new Map<string, number>();

function secret() {
  return `mock-gateway:${env().AUTH_SECRET}`;
}

export function mockPaymentId(orderId: string, amountPaise: number, outcome: "captured" | "failed") {
  return `mockpay_${orderId}_${amountPaise}_${outcome}_${randomBytes(4).toString("hex")}`;
}

export function mockSignature(orderId: string, paymentId: string) {
  return createHmac("sha256", secret()).update(`${orderId}|${paymentId}`).digest("hex");
}

function parse(paymentId: string) {
  const m = /^mockpay_(mock_order_[A-Za-z0-9]+)_(\d+)_(captured|failed)_[a-f0-9]+$/.exec(paymentId);
  if (!m) throw new Error("Unknown simulated payment id");
  return { orderId: m[1], amountPaise: Number(m[2]), outcome: m[3] as "captured" | "failed" };
}

function payment(paymentId: string): GatewayPayment {
  const p = parse(paymentId);
  const amountRefunded = refunded.get(paymentId) ?? 0;
  return {
    id: paymentId,
    orderId: p.orderId,
    amountPaise: p.amountPaise,
    currency: "INR",
    status: p.outcome === "failed" ? "failed" : amountRefunded >= p.amountPaise ? "refunded" : "captured",
    method: "simulated",
    feePaise: p.outcome === "failed" ? null : Math.round(p.amountPaise * 0.02),
    taxOnFeePaise: p.outcome === "failed" ? null : Math.round(p.amountPaise * 0.02 * 0.18),
    amountRefundedPaise: amountRefunded,
    errorCode: p.outcome === "failed" ? "SIMULATED_FAILURE" : "",
    errorDescription: p.outcome === "failed" ? "Simulated payment failure (test)" : "",
    raw: { simulated: true },
  };
}

export const mockGateway: PaymentGateway = {
  name: "mock",
  isSimulated: true,
  publicKeyId: () => "mock",
  async createOrder(amountPaise) {
    return { id: `mock_order_${randomBytes(8).toString("hex")}`, amountPaise };
  },
  verifyCheckoutSignature(orderId, paymentId, signature) {
    return safeEqual(mockSignature(orderId, paymentId), signature);
  },
  async fetchPayment(paymentId) {
    return payment(paymentId);
  },
  async fetchOrderPayments() {
    // The simulator can't list past attempts; the expiry job treats this as "no payment".
    return [];
  },
  async capture(paymentId) {
    return payment(paymentId);
  },
  async refund(paymentId, amountPaise) {
    refunded.set(paymentId, (refunded.get(paymentId) ?? 0) + amountPaise);
    return { id: `mockrfnd_${randomBytes(6).toString("hex")}`, status: "processed", amountPaise };
  },
};
