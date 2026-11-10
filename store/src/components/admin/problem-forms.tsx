"use client";

import { useActionState, useState, useTransition } from "react";
import { closeProblemAction, problemNoteAction, refundProblemAction, sendReplacementAction, type ProblemAdminResult } from "@/actions/admin/problems";
import { Field, useForm } from "@/components/form";
import { Notice } from "@/components/ui";
import { problemCloseSchema, problemReplacementSchema, refundFormSchema } from "@/lib/form-schemas";

const btn = "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60";

type Item = { id: number; label: string; quantity: number; lineTotalPaise: number; affected: boolean };

export function ProblemActions(props: { reportId: number; items: Item[]; refundablePaise: number; paymentMethod: "PREPAID" | "COD"; canRefund: boolean; staffNote: string }) {
  const [panel, setPanel] = useState<"replace" | "refund" | "close" | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${btn} bg-forest text-ivory`} aria-pressed={panel === "replace"} onClick={() => setPanel(panel === "replace" ? null : "replace")}>
          Send a replacement
        </button>
        {props.canRefund && props.refundablePaise > 0 && (
          <button type="button" className={`${btn} border border-chilli/30 bg-paper text-chilli`} aria-pressed={panel === "refund"} onClick={() => setPanel(panel === "refund" ? null : "refund")}>
            Refund
          </button>
        )}
        <button type="button" className={`${btn} border border-line bg-paper text-ink`} aria-pressed={panel === "close"} onClick={() => setPanel(panel === "close" ? null : "close")}>
          Reply and close
        </button>
      </div>
      {panel === "replace" && <ReplacementForm reportId={props.reportId} items={props.items} />}
      {panel === "refund" && <RefundForm reportId={props.reportId} items={props.items} refundablePaise={props.refundablePaise} paymentMethod={props.paymentMethod} />}
      {panel === "close" && <CloseForm reportId={props.reportId} />}
      <StaffNote reportId={props.reportId} note={props.staffNote} />
    </div>
  );
}

function ReplacementForm({ reportId, items }: { reportId: number; items: Item[] }) {
  const [state, action, pending] = useActionState<ProblemAdminResult, FormData>(sendReplacementAction.bind(null, reportId), null);
  const f = useForm({ schema: problemReplacementSchema, action, state });
  return (
    <form {...f.formProps} className="space-y-3 rounded-xl border border-line p-4">
      <p className="text-sm text-muted">Creates a ₹0 order with these items, takes the stock now, and emails the customer. Pack and ship it from Orders as usual. No tax invoice is issued for a free replacement.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <label key={i.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
            <span>{i.label}</span>
            <input name={`qty-${i.id}`} type="number" min={0} max={i.quantity} defaultValue={i.affected ? i.quantity : 0} className="field w-20 py-1.5" aria-label={`Quantity of ${i.label} to send again`} />
          </label>
        ))}
      </div>
      <Field f={f} name="note" label="Note for the customer">
        <input {...f.field("note")} className="field" maxLength={300} defaultValue="Sorry about that. We're sending a fresh one at no cost." />
      </Field>
      <button type="submit" className={`${btn} bg-forest text-ivory`} disabled={pending}>
        {pending ? "Creating…" : "Create replacement order"}
      </button>
      {state && !state.fieldErrors && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
    </form>
  );
}

function RefundForm({ reportId, items, refundablePaise, paymentMethod }: { reportId: number; items: Item[]; refundablePaise: number; paymentMethod: "PREPAID" | "COD" }) {
  const [state, action, pending] = useActionState<ProblemAdminResult, FormData>(refundProblemAction.bind(null, reportId, refundablePaise), null);
  const f = useForm({ schema: refundFormSchema(refundablePaise), action, state });
  const [mode, setMode] = useState<"RAZORPAY" | "MANUAL">(paymentMethod === "PREPAID" ? "RAZORPAY" : "MANUAL");
  const suggested = Math.min(refundablePaise, items.filter((i) => i.affected).reduce((s, i) => s + i.lineTotalPaise, 0) || refundablePaise);
  return (
    <form {...f.formProps} className="space-y-3 rounded-xl border border-chilli/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field f={f} name="amount" label={`Amount (₹), up to ₹${(refundablePaise / 100).toFixed(2)}`} hint="Suggested: what the affected items cost.">
          <input {...f.field("amount", { hint: true })} className="field" inputMode="decimal" maxLength={12} defaultValue={(suggested / 100).toFixed(2)} />
        </Field>
        <Field f={f} name="mode" label="Method">
          <select {...f.field("mode")} className="field" value={mode} onChange={(e) => setMode(e.target.value as "RAZORPAY" | "MANUAL")}>
            {paymentMethod === "PREPAID" && <option value="RAZORPAY">Razorpay (to original payment method)</option>}
            <option value="MANUAL">Manual (UPI / bank transfer already sent)</option>
          </select>
        </Field>
      </div>
      <Field f={f} name="reason" label="Reason (on the credit note and shown to the customer)">
        <input {...f.field("reason")} className="field" maxLength={200} defaultValue="Item arrived damaged" />
      </Field>
      {mode === "MANUAL" && (
        <Field f={f} name="reference" label="UPI / bank reference">
          <input {...f.field("reference")} className="field" maxLength={100} />
        </Field>
      )}
      <button type="submit" className={`${btn} bg-chilli text-white`} disabled={pending}>
        {pending ? "Refunding…" : "Refund and close report"}
      </button>
      {state && !state.fieldErrors && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
    </form>
  );
}

function CloseForm({ reportId }: { reportId: number }) {
  const [state, action, pending] = useActionState<ProblemAdminResult, FormData>(closeProblemAction.bind(null, reportId), null);
  const f = useForm({ schema: problemCloseSchema, action, state });
  return (
    <form {...f.formProps} className="space-y-3 rounded-xl border border-line p-4">
      <Field f={f} name="note" label="Message to the customer" hint="Emailed to them and shown on their order page.">
        <textarea {...f.field("note", { hint: true })} rows={3} maxLength={500} className="field" />
      </Field>
      <button type="submit" className={`${btn} bg-forest text-ivory`} disabled={pending}>
        {pending ? "Sending…" : "Send and close"}
      </button>
      {state && !state.fieldErrors && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
    </form>
  );
}

function StaffNote({ reportId, note }: { reportId: number; note: string }) {
  const [value, setValue] = useState(note);
  const [result, setResult] = useState<ProblemAdminResult>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-60 flex-1 text-sm">
        <span className="label">Internal note</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={2000} className="field" placeholder="Only staff see this" />
      </label>
      <button type="button" disabled={pending || value === note} className={`${btn} border border-line bg-paper text-ink`} onClick={() => start(async () => setResult(await problemNoteAction(reportId, value)))}>
        Save note
      </button>
      {result && <span className={`text-sm ${result.ok ? "text-forest" : "text-chilli"}`} role="status">{result.message}</span>}
    </div>
  );
}
