"use client";

import { useActionState } from "react";
import { importComingSoonListAction, type ImportResult } from "@/actions/admin/newsletter";
import { Field, useForm } from "@/components/form";
import { csvUploadSchema } from "@/lib/form-schemas";

export function ImportComingSoonForm() {
  const [state, action, pending] = useActionState<ImportResult, FormData>(importComingSoonListAction, null);
  const f = useForm({ schema: csvUploadSchema, values: (fd) => ({ file: fd.get("file") instanceof File ? fd.get("file") : null }), action, state, resetOnSuccess: true });
  return (
    <form {...f.formProps} className="space-y-3">
      <Field f={f} name="file" label="CSV file">
        <input {...f.field("file")} type="file" accept=".csv,text/csv" className="block text-sm file:mr-3 file:rounded-full file:border file:border-forest file:bg-paper file:px-4 file:py-2 file:text-sm file:font-semibold file:text-forest" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory disabled:opacity-60">
          {pending ? "Importing…" : "Import"}
        </button>
        {state && <span className={`text-sm font-semibold ${state.ok ? "text-forest" : "text-chilli"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
