"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { trackOrderAction, type TrackState } from "@/actions/orders";
import { FieldError, useForm } from "@/components/form";
import { Notice } from "@/components/ui";
import { trackSchema } from "@/lib/form-schemas";
import { useI18n } from "@/i18n/client";

export function TrackForm() {
  const { t, href } = useI18n();
  const router = useRouter();
  const [state, action, pending] = useActionState<TrackState, FormData>(trackOrderAction, null);
  const f = useForm({ schema: trackSchema, action });
  useEffect(() => {
    if (state?.ok) router.replace(`${href("/track")}?order=${state.orderNumber}&k=${state.token}`);
  }, [state, router, href]);
  return (
    <form {...f.formProps} className="card grid gap-4 p-5 sm:grid-cols-[1fr_1.4fr_auto] sm:items-start">
      <div>
        <label htmlFor={f.id("orderNumber")} className="label">
          {t("Order number")}
        </label>
        <input {...f.field("orderNumber")} inputMode="numeric" maxLength={14} className="field" placeholder={t("e.g. 100001")} />
        <FieldError f={f} name="orderNumber" />
      </div>
      <div>
        <label htmlFor={f.id("contact")} className="label">
          {t("Email or mobile number")}
        </label>
        <input {...f.field("contact")} maxLength={200} className="field" autoComplete="email" />
        <FieldError f={f} name="contact" />
      </div>
      <button type="submit" disabled={pending} className="rounded-full bg-forest px-6 py-2.5 font-bold text-ivory disabled:opacity-60 sm:mt-[1.875rem]">
        {pending ? t("Finding…") : t("Track")}
      </button>
      {state && !state.ok && (
        <Notice tone="error" className="sm:col-span-3">
          {t(state.message)}
        </Notice>
      )}
    </form>
  );
}
