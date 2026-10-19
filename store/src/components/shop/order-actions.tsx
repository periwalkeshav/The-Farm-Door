"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startPaymentAction } from "@/actions/checkout";
import { cancelOrderAction, confirmCodAction, type ActionResult } from "@/actions/orders";
import { Notice } from "@/components/ui";
import { openRazorpay, SimulatedPaymentDialog, type LaunchInput } from "./payment-launcher";

export function PayNowButton({ orderNumber, token }: { orderNumber: string; token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState<LaunchInput | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    const r = await startPaymentAction(orderNumber, token);
    if ("error" in r || !r.payment) {
      setError("error" in r ? r.error : "This order doesn't need payment.");
      setBusy(false);
      return;
    }
    const launch: LaunchInput = { payment: r.payment, orderNumber, token, prefill: { name: r.name, email: r.email, phone: r.phone } };
    if (r.payment.provider === "mock") {
      setSimulated(launch);
      return;
    }
    try {
      const result = await openRazorpay(launch);
      if (result !== "dismissed") router.push(result.redirectTo + (result.ok ? "&placed=1" : ""));
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment couldn't start.");
    }
    setBusy(false);
  }

  return (
    <div>
      <button type="button" onClick={pay} disabled={busy} className="rounded-full bg-forest px-6 py-3 font-bold text-ivory hover:bg-forest-deep disabled:opacity-60">
        {busy ? "Opening payment…" : "Pay now"}
      </button>
      {error && (
        <Notice tone="error" className="mt-3">
          {error}
        </Notice>
      )}
      {simulated && (
        <SimulatedPaymentDialog
          input={simulated}
          onDone={(r) => {
            setSimulated(null);
            setBusy(false);
            if (r !== "dismissed") router.push(r.redirectTo + (r.ok ? "&placed=1" : ""));
          }}
        />
      )}
    </div>
  );
}

export function ConfirmCodButton({ orderNumber, confirmToken }: { orderNumber: string; confirmToken: string }) {
  const [result, setResult] = useState<ActionResult>(null);
  const [pending, start] = useTransition();
  if (result?.ok) return <Notice tone="success">{result.message}</Notice>;
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => start(async () => setResult(await confirmCodAction(orderNumber, confirmToken)))} className="rounded-full bg-forest px-6 py-3 font-bold text-ivory disabled:opacity-60">
        {pending ? "Confirming…" : "Confirm my cash-on-delivery order"}
      </button>
      {result && !result.ok && (
        <Notice tone="error" className="mt-3">
          {result.message}
        </Notice>
      )}
    </div>
  );
}

export function CancelOrderButton({ orderNumber, token, paid }: { orderNumber: string; token: string; paid: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ActionResult>(null);
  const [pending, start] = useTransition();
  if (result?.ok) return <Notice tone="success">{result.message}</Notice>;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-chilli underline">
        Cancel this order
      </button>
    );
  return (
    <div className="rounded-xl border border-chilli/30 bg-chilli-soft/40 p-4">
      <p className="font-semibold text-forest">Cancel this order?</p>
      <p className="mt-1 text-sm text-muted">{paid ? "We'll refund the full amount to your original payment method (usually 5–7 working days)." : "Nothing has been charged."}</p>
      <label htmlFor="cancel-reason" className="label mt-3">
        Reason <span className="font-normal text-muted">(optional)</span>
      </label>
      <input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="field" />
      <div className="mt-3 flex gap-3">
        <button type="button" disabled={pending} onClick={() => start(async () => setResult(await cancelOrderAction(orderNumber, token, reason)))} className="rounded-full bg-chilli px-5 py-2.5 font-bold text-white disabled:opacity-60">
          {pending ? "Cancelling…" : "Yes, cancel order"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 text-sm font-semibold text-muted underline">
          Keep my order
        </button>
      </div>
      {result && !result.ok && <p className="mt-2 text-sm font-semibold text-chilli">{result.message}</p>}
    </div>
  );
}
