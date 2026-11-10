"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteAddressAction, requestDeletionAction, setDefaultAddressAction, submitReviewAction, updateProfileAction, type FormState } from "@/actions/account";
import { CharCount, Field, FieldError, useForm } from "@/components/form";
import { Notice } from "@/components/ui";
import { profileSchema, reviewFields } from "@/lib/form-schemas";
import { useI18n } from "@/i18n/client";

export function ProfileForm({ name, phone, email, marketingOptIn }: { name: string; phone: string; email: string; marketingOptIn: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfileAction, null);
  const f = useForm({ schema: profileSchema, action, state });
  return (
    <form {...f.formProps} className="space-y-4">
      <div>
        <p className="label">{t("Email")}</p>
        <p className="text-sm text-muted">{email}</p>
      </div>
      <Field f={f} name="name" label={t("Name")} optional>
        <input {...f.field("name")} defaultValue={name} maxLength={80} className="field" autoComplete="name" />
      </Field>
      <Field f={f} name="phone" label={t("Mobile number")} optional>
        <input {...f.field("phone")} defaultValue={phone} maxLength={16} className="field" autoComplete="tel" inputMode="tel" placeholder={t("10-digit mobile")} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="marketingOptIn" defaultChecked={marketingOptIn} className="size-4 accent-forest" />
        {t("Email me about new spices and offers")}
      </label>
      <button type="submit" disabled={pending} className="rounded-full bg-forest px-5 py-2.5 font-semibold text-ivory disabled:opacity-60">
        {pending ? t("Saving…") : t("Save")}
      </button>
      {state && <Notice tone={state.ok ? "success" : "error"}>{t(state.message)}</Notice>}
    </form>
  );
}

export function AddressActions({ id, isDefault }: { id: number; isDefault: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-3 text-sm">
      {!isDefault && (
        <button type="button" disabled={pending} onClick={() => start(() => setDefaultAddressAction(id))} className="font-semibold text-forest underline">
          {t("Make default")}
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => window.confirm(t("Delete this saved address?")) && start(() => deleteAddressAction(id))} className="font-semibold text-chilli underline">
        {t("Delete")}
      </button>
    </div>
  );
}

export function DeleteAccountButton({ requested }: { requested: boolean }) {
  const { t } = useI18n();
  const [state, setState] = useState<FormState>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (requested || state?.ok) return <Notice>{t(state?.message ?? "Your deletion request is being processed.")}</Notice>;
  if (!confirm)
    return (
      <button type="button" onClick={() => setConfirm(true)} className="text-sm font-semibold text-chilli underline">
        {t("Request deletion of my account and data")}
      </button>
    );
  return (
    <div className="rounded-xl border border-chilli/30 p-4 text-sm">
      <p>{t("This removes your profile, saved addresses and order history from your account. Invoices we must keep for tax purposes are retained as the law requires.")}</p>
      <button type="button" disabled={pending} onClick={() => start(async () => setState(await requestDeletionAction()))} className="mt-3 rounded-full bg-chilli px-4 py-2 font-semibold text-white">
        {pending ? t("Sending…") : t("Yes, request deletion")}
      </button>
    </div>
  );
}

export function ReviewForm({ productId, productName }: { productId: number; productName: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<FormState, FormData>(submitReviewAction, null);
  const [rating, setRating] = useState(5);
  const [length, setLength] = useState(0);
  const f = useForm({ schema: reviewFields, action, state });
  if (state?.ok) return <Notice tone="success">{t(state.message)}</Notice>;
  return (
    <form {...f.formProps} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="rating" value={rating} />
      <fieldset>
        <legend className="label">{t("Your rating for {name}", { name: productName })}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={t(n > 1 ? "{n} stars" : "{n} star", { n })} aria-pressed={rating === n} className={n <= rating ? "text-2xl text-saffron" : "text-2xl text-line"}>
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={f.id("title")} className="sr-only">
          {t("Headline (optional)")}
        </label>
        <input {...f.field("title")} maxLength={100} placeholder={t("Headline (optional)")} className="field" />
        <FieldError f={f} name="title" />
      </div>
      <div>
        <label htmlFor={f.id("body")} className="sr-only">
          {t("Your review")}
        </label>
        <textarea {...f.field("body")} maxLength={2000} rows={3} placeholder={t("What did you think? (at least 10 characters)")} className="field" onInput={(e) => setLength(e.currentTarget.value.trim().length)} />
        <div className="flex items-start justify-between gap-3">
          <FieldError f={f} name="body" />
          <CharCount value={length} max={2000} />
        </div>
      </div>
      <p className="text-xs text-muted">{t("Shown with your review: your first name and the city it was delivered to.")}</p>
      <button type="submit" disabled={pending} className="rounded-full bg-forest px-5 py-2 font-semibold text-ivory disabled:opacity-60">
        {pending ? t("Sending…") : t("Submit review")}
      </button>
      {state && !state.ok && !state.fieldErrors && <p className="text-sm font-semibold text-chilli">{t(state.message)}</p>}
    </form>
  );
}
