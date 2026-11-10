"use client";

import { useState } from "react";
import { simulatePaymentAction, verifyPaymentAction, type VerifyResult } from "@/actions/checkout";
import type { PaymentStart } from "@/server/orders/place";
import { useI18n } from "@/i18n/client";

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

export type LaunchInput = {
  payment: NonNullable<PaymentStart>;
  orderNumber: string;
  token: string;
  prefill: { name: string; email: string; phone: string };
};

/** Opens Razorpay Checkout; resolves with the server's verification result, or "dismissed". */
export async function openRazorpay(input: LaunchInput): Promise<VerifyResult | "dismissed"> {
  await loadRazorpay();
  return new Promise((resolve) => {
    const rzp = new window.Razorpay!({
      key: input.payment.keyId,
      order_id: input.payment.razorpayOrderId,
      amount: input.payment.amountPaise,
      currency: "INR",
      name: "The Farm Door",
      description: `Order ${input.orderNumber}`,
      prefill: { name: input.prefill.name, email: input.prefill.email, contact: input.prefill.phone },
      notes: { order_number: input.orderNumber },
      theme: { color: "#1F3B2D" },
      handler: async (r: RazorpayResponse) => {
        resolve(
          await verifyPaymentAction({
            orderNumber: input.orderNumber,
            token: input.token,
            razorpayOrderId: r.razorpay_order_id,
            razorpayPaymentId: r.razorpay_payment_id,
            razorpaySignature: r.razorpay_signature,
          }),
        );
      },
      modal: { ondismiss: () => resolve("dismissed"), confirm_close: true },
    });
    rzp.open();
  });
}

/** TEST MODE ONLY: stands in for Razorpay Checkout when payments are simulated. */
export function SimulatedPaymentDialog({ input, onDone }: { input: LaunchInput; onDone: (r: VerifyResult | "dismissed") => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const run = async (outcome: "captured" | "failed") => {
    setBusy(true);
    onDone(await simulatePaymentAction(input.orderNumber, input.token, outcome));
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="sim-title">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 shadow-2xl">
        <p className="mb-1 text-xs font-bold tracking-widest text-chilli uppercase">{t("Test mode")}</p>
        <h2 id="sim-title" className="text-2xl">
          {t("Simulated payment")}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {t("Razorpay isn't connected yet, so no real payment happens. Choose an outcome to test the order flow for {amount}.", { amount: `₹${(input.payment.amountPaise / 100).toFixed(2)}` })}
        </p>
        <div className="mt-5 grid gap-2">
          <button type="button" disabled={busy} onClick={() => run("captured")} className="rounded-full bg-forest px-5 py-3 font-bold text-ivory disabled:opacity-60">
            {t("Simulate successful payment")}
          </button>
          <button type="button" disabled={busy} onClick={() => run("failed")} className="rounded-full border border-chilli/40 px-5 py-3 font-bold text-chilli disabled:opacity-60">
            {t("Simulate failed payment")}
          </button>
          <button type="button" disabled={busy} onClick={() => onDone("dismissed")} className="px-5 py-2 text-sm font-semibold text-muted underline">
            {t("Close without paying")}
          </button>
        </div>
      </div>
    </div>
  );
}
