"use client";

import { useActionState } from "react";
import { stockAlertAction, type StockAlertState } from "@/actions/cart";
import { FieldError, useForm } from "@/components/form";
import { cn } from "@/components/ui";
import { stockAlertSchema } from "@/lib/form-schemas";
import { useI18n } from "@/i18n/client";

/** Shown under a sold-out pack. Keyed by variant so switching packs starts fresh. */
export function StockAlertForm({ variantId, email }: { variantId: number; email?: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<StockAlertState, FormData>(stockAlertAction, null);
  const f = useForm({ schema: stockAlertSchema, action, state });
  if (state?.ok) return <p className="mt-3 rounded-xl bg-sage-soft px-4 py-3 text-sm font-semibold text-forest">{t(state.message)}</p>;
  return (
    <form {...f.formProps} className="mt-3 rounded-2xl border border-line bg-paper p-4">
      <input type="hidden" name="variantId" value={variantId} />
      <label htmlFor={f.id("email")} className="text-sm font-semibold text-forest">
        {t("Email me when it's back")}
      </label>
      <div className="mt-2 flex gap-2">
        <input {...f.field("email")} type="email" autoComplete="email" maxLength={200} defaultValue={email} placeholder={t("Your email")} className="field flex-1 py-2" />
        <button type="submit" disabled={pending} className="rounded-xl border border-forest px-4 text-sm font-semibold text-forest disabled:opacity-60">
          {pending ? "…" : t("Notify me")}
        </button>
      </div>
      <FieldError f={f} name="email" />
      {state && !state.ok && !state.fieldErrors && <p className={cn("mt-1 text-sm font-semibold text-chilli")}>{t(state.message)}</p>}
      <p className="mt-2 text-xs text-muted">{t("One email when it's in stock again. Nothing else.")}</p>
    </form>
  );
}
