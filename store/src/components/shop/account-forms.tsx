"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteAddressAction, requestDeletionAction, setDefaultAddressAction, submitReviewAction, updateProfileAction, type FormState } from "@/actions/account";
import { Notice } from "@/components/ui";

export function ProfileForm({ name, phone, email, marketingOptIn }: { name: string; phone: string; email: string; marketingOptIn: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfileAction, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <p className="label">Email</p>
        <p className="text-sm text-muted">{email}</p>
      </div>
      <div>
        <label htmlFor="p-name" className="label">
          Name
        </label>
        <input id="p-name" name="name" defaultValue={name} className="field" autoComplete="name" />
      </div>
      <div>
        <label htmlFor="p-phone" className="label">
          Mobile number
        </label>
        <input id="p-phone" name="phone" defaultValue={phone} className="field" autoComplete="tel" inputMode="tel" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="marketingOptIn" defaultChecked={marketingOptIn} className="size-4 accent-forest" />
        Email me about new spices and offers
      </label>
      <button type="submit" disabled={pending} className="rounded-full bg-forest px-5 py-2.5 font-semibold text-ivory disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
      {state && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
    </form>
  );
}

export function AddressActions({ id, isDefault }: { id: number; isDefault: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-3 text-sm">
      {!isDefault && (
        <button type="button" disabled={pending} onClick={() => start(() => setDefaultAddressAction(id))} className="font-semibold text-forest underline">
          Make default
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => start(() => deleteAddressAction(id))} className="font-semibold text-chilli underline">
        Delete
      </button>
    </div>
  );
}

export function DeleteAccountButton({ requested }: { requested: boolean }) {
  const [state, setState] = useState<FormState>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (requested || state?.ok) return <Notice>{state?.message ?? "Your deletion request is being processed."}</Notice>;
  if (!confirm)
    return (
      <button type="button" onClick={() => setConfirm(true)} className="text-sm font-semibold text-chilli underline">
        Request deletion of my account and data
      </button>
    );
  return (
    <div className="rounded-xl border border-chilli/30 p-4 text-sm">
      <p>This removes your profile, saved addresses and order history from your account. Invoices we must keep for tax purposes are retained as the law requires.</p>
      <button type="button" disabled={pending} onClick={() => start(async () => setState(await requestDeletionAction()))} className="mt-3 rounded-full bg-chilli px-4 py-2 font-semibold text-white">
        {pending ? "Sending…" : "Yes, request deletion"}
      </button>
    </div>
  );
}

export function ReviewForm({ productId, productName }: { productId: number; productName: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitReviewAction, null);
  const [rating, setRating] = useState(5);
  if (state?.ok) return <Notice tone="success">{state.message}</Notice>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="rating" value={rating} />
      <fieldset>
        <legend className="label">Your rating for {productName}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={rating === n} className={n <= rating ? "text-2xl text-saffron" : "text-2xl text-line"}>
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <input name="title" maxLength={100} placeholder="Headline (optional)" className="field" />
      <textarea name="body" required minLength={10} maxLength={2000} rows={3} placeholder="What did you think?" className="field" />
      <button type="submit" disabled={pending} className="rounded-full bg-forest px-5 py-2 font-semibold text-ivory disabled:opacity-60">
        {pending ? "Sending…" : "Submit review"}
      </button>
      {state && !state.ok && <p className="text-sm font-semibold text-chilli">{state.message}</p>}
    </form>
  );
}
