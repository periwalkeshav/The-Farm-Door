import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvForTests } from "@/lib/env";
import { RazorpayError, razorpayGateway, verifyWebhookSignature } from "@/server/payments/razorpay";

// Keys come from tests/support/setup.ts. No request ever reaches Razorpay: fetch is replaced in each test.
const hmac = (text: string, secret: string) => createHmac("sha256", secret).update(text).digest("hex");

function stubFetch(status: number, body: unknown) {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("Razorpay signatures", () => {
  it("accepts the checkout signature only for that exact order, payment and secret", () => {
    const good = hmac("order_A|pay_B", "test_key_secret");
    expect(razorpayGateway.verifyCheckoutSignature("order_A", "pay_B", good)).toBe(true);
    expect(razorpayGateway.verifyCheckoutSignature("order_A", "pay_C", good)).toBe(false);
    expect(razorpayGateway.verifyCheckoutSignature("order_X", "pay_B", good)).toBe(false);
    expect(razorpayGateway.verifyCheckoutSignature("order_A", "pay_B", hmac("order_A|pay_B", "some_other_secret"))).toBe(false);
    expect(razorpayGateway.verifyCheckoutSignature("order_A", "pay_B", good.slice(0, -1))).toBe(false);
    expect(razorpayGateway.verifyCheckoutSignature("order_A", "pay_B", "")).toBe(false);
  });

  it("checks webhooks against the raw body, byte for byte", () => {
    const body = '{"event":"payment.captured","payload":{"amount":39800}}';
    const signature = hmac(body, "whsec");
    expect(verifyWebhookSignature(body, signature, "whsec")).toBe(true);
    // The same JSON with different spacing, or a changed amount, is rejected.
    expect(verifyWebhookSignature(JSON.stringify(JSON.parse(body), null, 1), signature, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body.replace("39800", "100"), signature, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, null, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, signature, "")).toBe(false);
  });
});

describe("Razorpay API client", () => {
  it("creates orders in rupees-in-paise with Basic auth, and trims long receipts", async () => {
    const fetch = stubFetch(200, { id: "order_123", amount: 39_800, currency: "INR", status: "created" });
    expect(await razorpayGateway.createOrder(39_800, "R".repeat(60), { orderNumber: "100001" })).toEqual({ id: "order_123", amountPaise: 39_800 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("rzp_test_dummy:test_key_secret").toString("base64")}`);
    expect(JSON.parse(String(init.body))).toEqual({ amount: 39_800, currency: "INR", receipt: "R".repeat(40), notes: { orderNumber: "100001" } });
  });

  it("reads payments, filling in missing fee and error fields, and escapes ids in the address", async () => {
    const fetch = stubFetch(200, { id: "pay_1", order_id: "order_1", amount: 39_800, currency: "INR", status: "captured", method: "upi" });
    expect(await razorpayGateway.fetchPayment("pay_1/../x")).toMatchObject({
      id: "pay_1",
      orderId: "order_1",
      amountPaise: 39_800,
      currency: "INR",
      status: "captured",
      method: "upi",
      feePaise: null,
      taxOnFeePaise: null,
      amountRefundedPaise: 0,
      errorCode: "",
      errorDescription: "",
    });
    expect(fetch.mock.calls[0][0]).toBe("https://api.razorpay.com/v1/payments/pay_1%2F..%2Fx");
  });

  it("lists an order's payments and asks for normal-speed refunds", async () => {
    stubFetch(200, { items: [{ id: "pay_1", order_id: "order_1", amount: 100, currency: "INR", status: "failed", method: "card", error_code: "BAD_REQUEST_ERROR" }] });
    expect(await razorpayGateway.fetchOrderPayments("order_1")).toMatchObject([{ id: "pay_1", status: "failed", errorCode: "BAD_REQUEST_ERROR" }]);

    const fetch = stubFetch(200, { id: "rfnd_1", status: "processed", amount: 5_000 });
    expect(await razorpayGateway.refund("pay_1", 5_000, { reason: "Damaged" })).toEqual({ id: "rfnd_1", status: "processed", amountPaise: 5_000 });
    expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toEqual({ amount: 5_000, speed: "normal", notes: { reason: "Damaged" } });
  });

  it("turns Razorpay errors into a RazorpayError with the status and reason", async () => {
    stubFetch(400, { error: { code: "BAD_REQUEST_ERROR", description: "The amount must be at least INR 1.00" } });
    const err = await razorpayGateway.createOrder(10, "r", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RazorpayError);
    expect(err).toMatchObject({ status: 400, message: expect.stringContaining("The amount must be at least INR 1.00") });
  });

  it("refuses to call Razorpay without keys", async () => {
    const fetch = stubFetch(200, {});
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    resetEnvForTests();
    await expect(razorpayGateway.fetchPayment("pay_1")).rejects.toThrow("Razorpay API keys are not configured.");
    expect(fetch).not.toHaveBeenCalled();
  });
});
