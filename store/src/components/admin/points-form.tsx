"use client";

import { useActionState } from "react";
import { adjustPointsAction, type PointsResult } from "@/actions/admin/loyalty";
import { Field, useForm } from "@/components/form";
import { pointsAdjustSchema } from "@/lib/form-schemas";

export function AdjustPointsForm({ customerId }: { customerId: number }) {
  const [state, action, pending] = useActionState<PointsResult, FormData>(adjustPointsAction.bind(null, customerId), null);
  const f = useForm({ schema: pointsAdjustSchema, action, state, resetOnSuccess: true });
  return (
    <form {...f.formProps} className="grid gap-3 sm:grid-cols-[110px_1fr_auto] sm:items-start">
      <Field f={f} name="points" label="Points">
        <input {...f.field("points")} inputMode="numeric" maxLength={7} placeholder="50 or -20" className="field py-2" />
      </Field>
      <Field f={f} name="note" label="Reason">
        <input {...f.field("note")} maxLength={200} placeholder="e.g. Sorry for the late delivery" className="field py-2" />
      </Field>
      <button type="submit" disabled={pending} className="rounded-full bg-forest px-4 py-2.5 text-sm font-semibold text-ivory disabled:opacity-60 sm:mt-7">
        {pending ? "Saving…" : "Adjust"}
      </button>
      {state?.ok && <p className="text-sm font-semibold text-forest sm:col-span-3">{state.message}</p>}
    </form>
  );
}
