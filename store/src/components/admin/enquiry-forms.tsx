"use client";

import { useActionState } from "react";
import { updateEnquiryAction, type EnquiryUpdateResult } from "@/actions/admin/enquiries";
import { FieldError, useForm } from "@/components/form";
import { enquiryUpdateSchema } from "@/lib/form-schemas";

export function EnquiryUpdateForm({ id, status, staffNote }: { id: number; status: string; staffNote: string }) {
  const [state, action, pending] = useActionState<EnquiryUpdateResult, FormData>(updateEnquiryAction.bind(null, id), null);
  const f = useForm({ schema: enquiryUpdateSchema, action, state });
  return (
    <form {...f.formProps} className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
      <div>
        <label htmlFor={f.id("status")} className="label">
          Status
        </label>
        <select {...f.field("status")} defaultValue={status} className="field py-2">
          <option value="NEW">New</option>
          <option value="CONTACTED">Contacted</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>
      <div>
        <label htmlFor={f.id("staffNote")} className="label">
          Internal note
        </label>
        <input {...f.field("staffNote")} defaultValue={staffNote} maxLength={2000} placeholder="e.g. Quoted ₹ per kg on call, follow up Monday" className="field py-2" />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        {state && <span className={`text-sm font-semibold ${state.ok ? "text-forest" : "text-chilli"}`}>{state.message}</span>}
      </div>
      <FieldError f={f} name="staffNote" className="sm:col-span-3" />
    </form>
  );
}
