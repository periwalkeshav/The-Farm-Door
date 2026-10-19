export type GatewayOrder = { id: string; amountPaise: number };

export type GatewayPayment = {
  id: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method: string;
  feePaise: number | null;
  taxOnFeePaise: number | null;
  amountRefundedPaise: number;
  errorCode: string;
  errorDescription: string;
  raw: unknown;
};

export type GatewayRefund = { id: string; status: "pending" | "processed" | "failed"; amountPaise: number };

export interface PaymentGateway {
  readonly name: "razorpay" | "mock";
  readonly isSimulated: boolean;
  publicKeyId(): string;
  createOrder(amountPaise: number, receipt: string, notes: Record<string, string>): Promise<GatewayOrder>;
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  fetchOrderPayments(orderId: string): Promise<GatewayPayment[]>;
  capture(paymentId: string, amountPaise: number): Promise<GatewayPayment>;
  refund(paymentId: string, amountPaise: number, notes: Record<string, string>): Promise<GatewayRefund>;
}
