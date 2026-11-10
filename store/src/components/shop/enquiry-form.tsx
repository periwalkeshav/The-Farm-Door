"use client";

import { useActionState, useState } from "react";
import { submitEnquiryAction, type EnquiryState } from "@/actions/enquiry";
import { CharCount, Field, useForm } from "@/components/form";
import { Notice } from "@/components/ui";
import { enquirySchema } from "@/lib/form-schemas";
import { useI18n } from "@/i18n/client";

export function EnquiryForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<EnquiryState, FormData>(submitEnquiryAction, null);
  const f = useForm({ schema: enquirySchema, action, state });
  const [length, setLength] = useState(0);
  if (state?.ok) return <Notice tone="success">{t(state.message)}</Notice>;
  return (
    <form {...f.formProps} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field f={f} name="name" label={t("Your name")}>
          <input {...f.field("name")} autoComplete="name" maxLength={80} className="field" />
        </Field>
        <Field f={f} name="businessName" label={t("Business name")} optional>
          <input {...f.field("businessName")} autoComplete="organization" maxLength={120} className="field" />
        </Field>
        <Field f={f} name="email" label={t("Email")}>
          <input {...f.field("email")} type="email" autoComplete="email" maxLength={200} className="field" />
        </Field>
        <Field f={f} name="phone" label={t("Mobile number")}>
          <input {...f.field("phone")} type="tel" inputMode="tel" autoComplete="tel" maxLength={16} placeholder={t("10-digit mobile")} className="field" />
        </Field>
        <Field f={f} name="city" label={t("City")} optional>
          <input {...f.field("city")} autoComplete="address-level2" maxLength={80} className="field" />
        </Field>
        <Field f={f} name="gstin" label={t("GSTIN")} optional>
          <input {...f.field("gstin")} maxLength={15} autoComplete="off" placeholder={t("e.g. 08ABCDE1234F1Z0")} className="field uppercase" />
        </Field>
      </div>
      <Field f={f} name="requirement" label={t("What do you need?")}>
        <textarea
          {...f.field("requirement")}
          rows={5}
          maxLength={3000}
          onInput={(e) => setLength(e.currentTarget.value.trim().length)}
          placeholder={t("e.g. Turmeric powder 10 kg and red chilli powder 5 kg every month, delivered to Jaipur")}
          className="field"
        />
        <CharCount value={length} max={3000} />
      </Field>
      {/* Leave empty: helps filter out automated spam. */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="enq-website">Website</label>
        <input id="enq-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <p className="text-xs text-muted">{t("We use these details only to reply to your enquiry.")}</p>
      {state && !state.ok && <Notice tone="error">{t(state.message)}</Notice>}
      <button type="submit" disabled={pending} className="rounded-full bg-forest px-6 py-3 font-bold text-ivory hover:bg-forest-deep disabled:opacity-60">
        {pending ? t("Sending…") : t("Send enquiry")}
      </button>
    </form>
  );
}
