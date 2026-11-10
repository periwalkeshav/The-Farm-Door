"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  addNoteAdminAction,
  cancelAdminAction,
  confirmCodAdminAction,
  markDeliveredAdminAction,
  markShippedAdminAction,
  packAdminAction,
  refundAdminAction,
  restockAdminAction,
  simulateCourierAdminAction,
  syncTrackingAdminAction,
  type AdminResult,
} from "@/actions/admin/orders";
import { Field, useForm } from "@/components/form";
import { Notice } from "@/components/ui";
import { cancelReasonSchema, manualShipSchema, orderNoteSchema, refundFormSchema } from "@/lib/form-schemas";

function useAction() {
  const [result, setResult] = useState<AdminResult>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<AdminResult>) => start(async () => setResult(await fn()));
  return { result, pending, run };
}

const btn = "rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50";

export function OrderActionPanel(props: {
  orderId: number;
  status: string;
  paymentMethod: "PREPAID" | "COD";
  stockState: string;
  canManage: boolean;
  canPack: boolean;
  canRefund: boolean;
  canRestock: boolean;
  refundablePaise: number;
  hasShipment: boolean;
  simulatedCourier: boolean;
}) {
  const { result, pending, run } = useAction();
  const [panel, setPanel] = useState<"" | "cancel" | "refund" | "ship" | "note">("");
  const [refundMode, setRefundMode] = useState<"RAZORPAY" | "MANUAL">(props.paymentMethod === "PREPAID" ? "RAZORPAY" : "MANUAL");
  const s = props.status;
  const text = (fd: FormData, k: string) => String(fd.get(k) ?? "");

  const cancelForm = useForm({ schema: cancelReasonSchema, state: result, onValid: (fd) => run(() => cancelAdminAction(props.orderId, text(fd, "reason"))) });
  const refundForm = useForm({
    schema: refundFormSchema(props.refundablePaise),
    state: result,
    onValid: (fd) => {
      const amount = text(fd, "amount");
      const where = refundMode === "RAZORPAY" ? "to the customer's original payment method through Razorpay" : "as already sent by UPI / bank transfer";
      if (!window.confirm(`Refund ₹${amount} ${where}? This can't be undone.`)) return;
      run(() => refundAdminAction(props.orderId, { amount, mode: refundMode, reason: text(fd, "reason"), reference: text(fd, "reference") }));
    },
  });
  const shipForm = useForm({
    schema: manualShipSchema,
    state: result,
    onValid: (fd) => run(() => markShippedAdminAction(props.orderId, { courierName: text(fd, "courierName"), awb: text(fd, "awb"), trackingUrl: text(fd, "trackingUrl") })),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {props.canManage && s === "AWAITING_COD_CONFIRMATION" && (
          <button className={`${btn} bg-forest text-ivory`} disabled={pending} onClick={() => run(() => confirmCodAdminAction(props.orderId))}>
            Confirm COD order (called the customer)
          </button>
        )}
        {props.canPack && s === "CONFIRMED" && (
          <button className={`${btn} bg-forest text-ivory`} disabled={pending} onClick={() => run(() => packAdminAction(props.orderId))}>
            {pending ? "Booking courier…" : "Mark packed & book courier"}
          </button>
        )}
        {props.canPack && (s === "CONFIRMED" || s === "PACKED") && (
          <button className={`${btn} border border-forest text-forest`} onClick={() => setPanel(panel === "ship" ? "" : "ship")}>
            Shipped another way…
          </button>
        )}
        {props.canManage && ["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERY_FAILED"].includes(s) && (
          <button
            className={`${btn} border border-forest text-forest`}
            disabled={pending}
            onClick={() => window.confirm("Mark this order as delivered? Use this only when you're sure it reached the customer.") && run(() => markDeliveredAdminAction(props.orderId))}
          >
            Mark delivered
          </button>
        )}
        {props.hasShipment && !props.simulatedCourier && (
          <button className={`${btn} border border-line text-forest`} disabled={pending} onClick={() => run(() => syncTrackingAdminAction(props.orderId))}>
            Refresh tracking
          </button>
        )}
        {props.canRestock && s === "RETURNED_TO_ORIGIN" && props.stockState === "COMMITTED" && (
          <button className={`${btn} border border-forest text-forest`} disabled={pending} onClick={() => window.confirm("Put the returned items back into sellable stock?") && run(() => restockAdminAction(props.orderId))}>
            Returned items are fine: restock
          </button>
        )}
        {props.canRefund && props.refundablePaise > 0 && (
          <button className={`${btn} border border-chilli/40 text-chilli`} onClick={() => setPanel(panel === "refund" ? "" : "refund")}>
            Refund…
          </button>
        )}
        {props.canManage && ["AWAITING_PAYMENT", "AWAITING_COD_CONFIRMATION", "CONFIRMED", "PACKED"].includes(s) && (
          <button className={`${btn} border border-chilli/40 text-chilli`} onClick={() => setPanel(panel === "cancel" ? "" : "cancel")}>
            Cancel order…
          </button>
        )}
        {props.canManage && (
          <button className={`${btn} border border-line text-muted`} onClick={() => setPanel(panel === "note" ? "" : "note")}>
            Add internal note
          </button>
        )}
      </div>

      {props.simulatedCourier && props.hasShipment && props.canManage && !["DELIVERED", "RETURNED_TO_ORIGIN", "CANCELLED"].includes(s) && (
        <div className="rounded-xl border border-dashed border-chilli/40 p-3 text-sm">
          <p className="mb-2 font-semibold text-chilli">Test mode: simulate courier updates</p>
          <div className="flex flex-wrap gap-2">
            {(["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "DELIVERY_FAILED", "RTO_INITIATED", "RTO_DELIVERED"] as const).map((st) => (
              <button key={st} className={`${btn} border border-line bg-paper text-ink`} disabled={pending} onClick={() => run(() => simulateCourierAdminAction(props.orderId, st))}>
                {st.replaceAll("_", " ").toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {panel === "cancel" && (
        <form {...cancelForm.formProps} className="rounded-xl border border-chilli/30 p-4">
          <Field f={cancelForm} name="reason" label="Reason (shown to the customer)" hint="Stock is put back. Online payments are refunded in full automatically. A booked courier pickup is cancelled first.">
            <input {...cancelForm.field("reason", { hint: true })} className="field" maxLength={200} />
          </Field>
          <button type="submit" className={`${btn} mt-3 bg-chilli text-white`} disabled={pending}>
            {pending ? "Cancelling…" : "Cancel this order"}
          </button>
        </form>
      )}

      {panel === "refund" && (
        <form {...refundForm.formProps} className="space-y-3 rounded-xl border border-chilli/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field f={refundForm} name="amount" label={`Amount (₹), up to ₹${(props.refundablePaise / 100).toFixed(2)}`}>
              <input {...refundForm.field("amount")} className="field" inputMode="decimal" maxLength={12} defaultValue={(props.refundablePaise / 100).toFixed(2)} />
            </Field>
            <Field f={refundForm} name="mode" label="Method">
              <select {...refundForm.field("mode")} className="field" value={refundMode} onChange={(e) => setRefundMode(e.target.value as "RAZORPAY" | "MANUAL")}>
                {props.paymentMethod === "PREPAID" && <option value="RAZORPAY">Razorpay (to original payment method)</option>}
                <option value="MANUAL">Manual (UPI / bank transfer already sent)</option>
              </select>
            </Field>
          </div>
          <Field f={refundForm} name="reason" label="Reason">
            <input {...refundForm.field("reason")} className="field" maxLength={200} placeholder="e.g. Damaged jar, photo received" />
          </Field>
          {refundMode === "MANUAL" && (
            <Field f={refundForm} name="reference" label="UPI / bank reference">
              <input {...refundForm.field("reference")} className="field" maxLength={100} />
            </Field>
          )}
          <p className="text-xs text-muted">A credit note is issued automatically if the order was invoiced. The customer is emailed.</p>
          <button type="submit" className={`${btn} bg-chilli text-white`} disabled={pending}>
            {pending ? "Refunding…" : "Issue refund"}
          </button>
        </form>
      )}

      {panel === "ship" && (
        <form {...shipForm.formProps} className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-3">
          <Field f={shipForm} name="courierName" label="Courier">
            <input {...shipForm.field("courierName")} className="field" maxLength={80} placeholder="e.g. India Post / hand delivery" />
          </Field>
          <Field f={shipForm} name="awb" label="Tracking number" optional>
            <input {...shipForm.field("awb")} className="field" maxLength={60} />
          </Field>
          <Field f={shipForm} name="trackingUrl" label="Tracking link" optional>
            <input {...shipForm.field("trackingUrl")} className="field" maxLength={200} placeholder="https://…" />
          </Field>
          <button type="submit" className={`${btn} bg-forest text-ivory sm:col-span-3 sm:justify-self-start`} disabled={pending}>
            Mark shipped and email customer
          </button>
        </form>
      )}

      {panel === "note" && <NoteForm orderId={props.orderId} />}

      {result && !result.fieldErrors && (
        <Notice tone={result.ok ? "success" : "error"}>
          {result.message}
          {/* Missing invoice details: one click to where they're entered. */}
          {!result.ok && result.message.includes("Admin > Settings") && (
            <>
              {" "}
              <Link href="/admin/settings" className="font-semibold underline">
                Open Settings
              </Link>
            </>
          )}
        </Notice>
      )}
    </div>
  );
}

function NoteForm({ orderId }: { orderId: number }) {
  const { result, pending, run } = useAction();
  const f = useForm({ schema: orderNoteSchema, state: result, resetOnSuccess: true, onValid: (fd) => run(() => addNoteAdminAction(orderId, String(fd.get("note") ?? ""))) });
  return (
    <form {...f.formProps} className="rounded-xl border border-line p-4">
      <Field f={f} name="note" label="Internal note (not visible to the customer)">
        <textarea {...f.field("note")} className="field" rows={2} maxLength={1000} />
      </Field>
      <button type="submit" className={`${btn} mt-2 bg-forest text-ivory`} disabled={pending}>
        {pending ? "Saving…" : "Save note"}
      </button>
      {result && !result.fieldErrors && <p className={`mt-2 text-sm ${result.ok ? "text-forest" : "text-chilli"}`}>{result.message}</p>}
    </form>
  );
}
