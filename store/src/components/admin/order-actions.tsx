"use client";

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
import { Notice } from "@/components/ui";

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
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState({ amount: (props.refundablePaise / 100).toFixed(2), reason: "", mode: (props.paymentMethod === "PREPAID" ? "RAZORPAY" : "MANUAL") as "RAZORPAY" | "MANUAL", reference: "" });
  const [ship, setShip] = useState({ courierName: "", awb: "", trackingUrl: "" });
  const s = props.status;

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
          <button className={`${btn} border border-forest text-forest`} disabled={pending} onClick={() => run(() => markDeliveredAdminAction(props.orderId))}>
            Mark delivered
          </button>
        )}
        {props.hasShipment && !props.simulatedCourier && (
          <button className={`${btn} border border-line text-forest`} disabled={pending} onClick={() => run(() => syncTrackingAdminAction(props.orderId))}>
            Refresh tracking
          </button>
        )}
        {props.canRestock && s === "RETURNED_TO_ORIGIN" && props.stockState === "COMMITTED" && (
          <button className={`${btn} border border-forest text-forest`} disabled={pending} onClick={() => run(() => restockAdminAction(props.orderId))}>
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
        <div className="rounded-xl border border-chilli/30 p-4">
          <label htmlFor="cancel-why" className="label">
            Reason (shown to the customer)
          </label>
          <input id="cancel-why" className="field" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          <p className="mt-2 text-xs text-muted">Stock is put back. Online payments are refunded in full automatically. A booked courier pickup is cancelled first.</p>
          <button className={`${btn} mt-3 bg-chilli text-white`} disabled={pending} onClick={() => run(() => cancelAdminAction(props.orderId, reason))}>
            Cancel this order
          </button>
        </div>
      )}

      {panel === "refund" && (
        <div className="space-y-3 rounded-xl border border-chilli/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="rf-amount" className="label">
                Amount (₹), up to ₹{(props.refundablePaise / 100).toFixed(2)}
              </label>
              <input id="rf-amount" className="field" inputMode="decimal" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} />
            </div>
            <div>
              <label htmlFor="rf-mode" className="label">
                Method
              </label>
              <select id="rf-mode" className="field" value={refund.mode} onChange={(e) => setRefund({ ...refund, mode: e.target.value as "RAZORPAY" | "MANUAL" })}>
                {props.paymentMethod === "PREPAID" && <option value="RAZORPAY">Razorpay (to original payment method)</option>}
                <option value="MANUAL">Manual (UPI / bank transfer already sent)</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="rf-reason" className="label">
              Reason
            </label>
            <input id="rf-reason" className="field" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} placeholder="e.g. Damaged jar, photo received" />
          </div>
          {refund.mode === "MANUAL" && (
            <div>
              <label htmlFor="rf-ref" className="label">
                UPI / bank reference
              </label>
              <input id="rf-ref" className="field" value={refund.reference} onChange={(e) => setRefund({ ...refund, reference: e.target.value })} />
            </div>
          )}
          <p className="text-xs text-muted">A credit note is issued automatically if the order was invoiced. The customer is emailed.</p>
          <button className={`${btn} bg-chilli text-white`} disabled={pending} onClick={() => run(() => refundAdminAction(props.orderId, refund))}>
            Issue refund
          </button>
        </div>
      )}

      {panel === "ship" && (
        <div className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-3">
          <div>
            <label htmlFor="sh-courier" className="label">
              Courier
            </label>
            <input id="sh-courier" className="field" value={ship.courierName} onChange={(e) => setShip({ ...ship, courierName: e.target.value })} placeholder="e.g. India Post / hand delivery" />
          </div>
          <div>
            <label htmlFor="sh-awb" className="label">
              Tracking number
            </label>
            <input id="sh-awb" className="field" value={ship.awb} onChange={(e) => setShip({ ...ship, awb: e.target.value })} />
          </div>
          <div>
            <label htmlFor="sh-url" className="label">
              Tracking link
            </label>
            <input id="sh-url" className="field" value={ship.trackingUrl} onChange={(e) => setShip({ ...ship, trackingUrl: e.target.value })} placeholder="https://…" />
          </div>
          <button className={`${btn} bg-forest text-ivory sm:col-span-3 sm:justify-self-start`} disabled={pending} onClick={() => run(() => markShippedAdminAction(props.orderId, ship))}>
            Mark shipped and email customer
          </button>
        </div>
      )}

      {panel === "note" && <NoteForm orderId={props.orderId} />}

      {result && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
    </div>
  );
}

function NoteForm({ orderId }: { orderId: number }) {
  const { result, pending, run } = useAction();
  const [note, setNote] = useState("");
  return (
    <div className="rounded-xl border border-line p-4">
      <label htmlFor="note" className="label">
        Internal note (not visible to the customer)
      </label>
      <textarea id="note" className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className={`${btn} mt-2 bg-forest text-ivory`} disabled={pending} onClick={() => run(() => addNoteAdminAction(orderId, note))}>
        Save note
      </button>
      {result && <p className={`mt-2 text-sm ${result.ok ? "text-forest" : "text-chilli"}`}>{result.message}</p>}
    </div>
  );
}
