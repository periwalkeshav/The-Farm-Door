"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buyAgainAction, type BuyAgainResult } from "@/actions/cart";
import { startPaymentAction } from "@/actions/checkout";
import { cancelOrderAction, confirmCodAction, type ActionResult } from "@/actions/orders";
import { cn, Notice } from "@/components/ui";
import { openRazorpay, SimulatedPaymentDialog, type LaunchInput } from "./payment-launcher";
import { useI18n } from "@/i18n/client";

export function PayNowButton({ orderNumber, token }: { orderNumber: string; token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulated, setSimulated] = useState<LaunchInput | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    const r = await startPaymentAction(orderNumber, token);
    if ("error" in r || !r.payment) {
      setError("error" in r ? t(r.error) : t("This order doesn't need payment."));
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
      setError(err instanceof Error ? t(err.message) : t("Payment couldn't start."));
    }
    setBusy(false);
  }

  return (
    <div>
      <button type="button" onClick={pay} disabled={busy} className="rounded-full bg-forest px-6 py-3 font-bold text-ivory hover:bg-forest-deep disabled:opacity-60">
        {busy ? t("Opening payment…") : t("Pay now")}
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
  const { t } = useI18n();
  const [result, setResult] = useState<ActionResult>(null);
  const [pending, start] = useTransition();
  if (result?.ok) return <Notice tone="success">{t(result.message)}</Notice>;
  return (
    <div>
      <button type="button" disabled={pending} onClick={() => start(async () => setResult(await confirmCodAction(orderNumber, confirmToken)))} className="rounded-full bg-forest px-6 py-3 font-bold text-ivory disabled:opacity-60">
        {pending ? t("Confirming…") : t("Confirm my cash-on-delivery order")}
      </button>
      {result && !result.ok && (
        <Notice tone="error" className="mt-3">
          {t(result.message)}
        </Notice>
      )}
    </div>
  );
}

export function CancelOrderButton({ orderNumber, token, paid }: { orderNumber: string; token: string; paid: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ActionResult>(null);
  const [pending, start] = useTransition();
  if (result?.ok) return <Notice tone="success">{t(result.message)}</Notice>;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-chilli underline">
        {t("Cancel this order")}
      </button>
    );
  return (
    <div className="rounded-xl border border-chilli/30 bg-chilli-soft/40 p-4">
      <p className="font-semibold text-forest">{t("Cancel this order?")}</p>
      <p className="mt-1 text-sm text-muted">{paid ? t("We'll refund the full amount to your original payment method (usually 5–7 working days).") : t("Nothing has been charged.")}</p>
      <label htmlFor="cancel-reason" className="label mt-3">
        {t("Reason")} <span className="font-normal text-muted">({t("optional")})</span>
      </label>
      <input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="field" />
      <div className="mt-3 flex gap-3">
        <button type="button" disabled={pending} onClick={() => start(async () => setResult(await cancelOrderAction(orderNumber, token, reason)))} className="rounded-full bg-chilli px-5 py-2.5 font-bold text-white disabled:opacity-60">
          {pending ? t("Cancelling…") : t("Yes, cancel order")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 text-sm font-semibold text-muted underline">
          {t("Keep my order")}
        </button>
      </div>
      {result && !result.ok && <p className="mt-2 text-sm font-semibold text-chilli">{t(result.message)}</p>}
    </div>
  );
}

export function BuyAgainButton({ orderNumber, token, label = "Buy again", compact = false }: { orderNumber: string; token: string; label?: string; compact?: boolean }) {
  const { t, href } = useI18n();
  const router = useRouter();
  const [result, setResult] = useState<BuyAgainResult | null>(null);
  const [pending, start] = useTransition();
  function buyAgain() {
    start(async () => {
      const r = await buyAgainAction(orderNumber, token);
      if (r.ok && r.unavailable.length === 0) router.push(href("/cart"));
      else setResult(r);
    });
  }
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={buyAgain}
        className={cn("rounded-full border border-forest font-semibold text-forest hover:bg-forest/5 disabled:opacity-60", compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm")}
      >
        {pending ? t("Adding…") : t(label)}
      </button>
      {result && (
        <Notice tone={result.ok ? "warn" : "error"} className="mt-3">
          {t(result.message)}
          {result.unavailable.length > 0 && (
            <>
              {" "}
              {t("Not available right now:")} {result.unavailable.join(", ")}.
            </>
          )}
          {result.ok && (
            <>
              {" "}
              <Link href={href("/cart")} className="font-semibold underline">
                {t("Go to cart")}
              </Link>
            </>
          )}
        </Notice>
      )}
    </div>
  );
}
