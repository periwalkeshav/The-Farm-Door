import { env } from "@/lib/env";
import { mockGateway } from "./mock";
import { razorpayGateway } from "./razorpay";
import type { PaymentGateway } from "./types";

export * from "./types";

export function paymentGateway(): PaymentGateway {
  return env().PAYMENTS_PROVIDER === "mock" ? mockGateway : razorpayGateway;
}
