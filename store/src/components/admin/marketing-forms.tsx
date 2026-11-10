"use client";

import { useActionState, useState, useTransition } from "react";
import { moderateReviewAction, saveCouponAction, type MarketingResult } from "@/actions/admin/marketing";
import { Field, FieldError, useForm } from "@/components/form";
import { couponFormSchema } from "@/lib/form-schemas";

type CouponValues = {
  id: number | null;
  code: string;
  description: string;
  type: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value: string;
  maxDiscount: string;
  minOrder: string;
  scope: "ALL" | "PRODUCTS" | "CATEGORIES";
  productIds: number[];
  categoryIds: number[];
  startsOn: string;
  endsOn: string;
  usageLimitTotal: string;
  usageLimitPerCustomer: string;
  isActive: boolean;
  isFeatured: boolean;
};

export function CouponForm({ coupon, products, categories }: { coupon: CouponValues; products: { id: number; name: string }[]; categories: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<MarketingResult, FormData>(saveCouponAction.bind(null, coupon.id), null);
  const f = useForm({ schema: couponFormSchema, action, state });
  const [type, setType] = useState(coupon.type);
  const [scope, setScope] = useState(coupon.scope);
  const hasFieldErrors = Object.keys(f.errors).length > 0;
  return (
    <form {...f.formProps} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Field f={f} name="code" label="Code" hint="3–30 letters or numbers. Customers type this at checkout.">
          <input {...f.field("code", { hint: true })} defaultValue={coupon.code} maxLength={30} autoComplete="off" className="field uppercase" placeholder="DIWALI15" />
        </Field>
        <Field f={f} name="description" label="Description (shown to the customer when applied)" optional className="md:col-span-2">
          <input {...f.field("description")} defaultValue={coupon.description} maxLength={200} className="field" placeholder="15% off for Diwali" />
        </Field>
        <Field f={f} name="type" label="Type">
          <select {...f.field("type")} value={type} onChange={(e) => setType(e.target.value as CouponValues["type"])} className="field">
            <option value="PERCENT">Percentage off</option>
            <option value="FIXED">Fixed amount off</option>
            <option value="FREE_SHIPPING">Free shipping</option>
          </select>
        </Field>
        {type !== "FREE_SHIPPING" && (
          <Field f={f} name="value" label={type === "PERCENT" ? "Percent off" : "Amount off (₹)"} hint={type === "PERCENT" ? "1 to 90" : undefined}>
            <input {...f.field("value", { hint: type === "PERCENT" })} defaultValue={coupon.value} inputMode="decimal" maxLength={10} className="field" placeholder={type === "PERCENT" ? "15" : "100"} />
          </Field>
        )}
        {type === "PERCENT" && (
          <Field f={f} name="maxDiscount" label="Maximum discount ₹" optional>
            <input {...f.field("maxDiscount")} defaultValue={coupon.maxDiscount} inputMode="decimal" maxLength={10} className="field" />
          </Field>
        )}
        <Field f={f} name="minOrder" label="Minimum order ₹" optional>
          <input {...f.field("minOrder")} defaultValue={coupon.minOrder} inputMode="decimal" maxLength={10} className="field" />
        </Field>
        <Field f={f} name="usageLimitTotal" label="Total uses allowed" optional>
          <input {...f.field("usageLimitTotal")} defaultValue={coupon.usageLimitTotal} inputMode="numeric" maxLength={7} className="field" />
        </Field>
        <Field f={f} name="usageLimitPerCustomer" label="Uses per customer" optional>
          <input {...f.field("usageLimitPerCustomer")} defaultValue={coupon.usageLimitPerCustomer} inputMode="numeric" maxLength={7} className="field" />
        </Field>
        <Field f={f} name="startsOn" label="Starts on" optional>
          <input {...f.field("startsOn")} type="date" defaultValue={coupon.startsOn} className="field" />
        </Field>
        <Field f={f} name="endsOn" label="Ends after" optional>
          <input {...f.field("endsOn")} type="date" defaultValue={coupon.endsOn} className="field" />
        </Field>
      </div>
      <fieldset>
        <legend className="label">Applies to</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {(["ALL", "PRODUCTS", "CATEGORIES"] as const).map((s) => (
            <label key={s} className="flex items-center gap-2">
              <input type="radio" name="scope" value={s} checked={scope === s} onChange={() => setScope(s)} className="accent-forest" />
              {s === "ALL" ? "Whole order" : s === "PRODUCTS" ? "Selected products" : "Selected categories"}
            </label>
          ))}
        </div>
        {scope === "PRODUCTS" && (
          <div className="mt-3 grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-line p-3 text-sm sm:grid-cols-2">
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-2">
                <input type="checkbox" name="productIds" value={p.id} defaultChecked={coupon.productIds.includes(p.id)} className="accent-forest" /> {p.name}
              </label>
            ))}
          </div>
        )}
        {scope === "CATEGORIES" && (
          <div className="mt-3 flex flex-wrap gap-4 rounded-xl border border-line p-3 text-sm">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2">
                <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={coupon.categoryIds.includes(c.id)} className="accent-forest" /> {c.name}
              </label>
            ))}
          </div>
        )}
        <FieldError f={f} name="productIds" />
        <FieldError f={f} name="categoryIds" />
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={coupon.isActive} className="size-4 accent-forest" /> Active
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isFeatured" defaultChecked={coupon.isFeatured} className="size-4 accent-forest" /> Show this code in the scrolling banner at the top of the shop (the newest featured code that&apos;s valid now is shown)
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-forest px-6 py-2.5 font-semibold text-ivory disabled:opacity-60">
          {pending ? "Saving…" : coupon.id ? "Save coupon" : "Create coupon"}
        </button>
        {hasFieldErrors ? (
          <span className="text-sm font-semibold text-chilli">Please fix the highlighted fields.</span>
        ) : (
          state && <span className={`text-sm font-semibold ${state.ok ? "text-forest" : "text-chilli"}`}>{state.message}</span>
        )}
      </div>
    </form>
  );
}

export function ReviewButtons({ reviewId, status }: { reviewId: number; status: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      {status !== "APPROVED" && (
        <button type="button" disabled={pending} onClick={() => start(() => moderateReviewAction(reviewId, "APPROVED"))} className="rounded-full bg-forest px-4 py-1.5 text-sm font-semibold text-ivory disabled:opacity-50">
          Approve
        </button>
      )}
      {status !== "REJECTED" && (
        <button type="button" disabled={pending} onClick={() => start(() => moderateReviewAction(reviewId, "REJECTED"))} className="rounded-full border border-chilli/40 px-4 py-1.5 text-sm font-semibold text-chilli disabled:opacity-50">
          {status === "APPROVED" ? "Hide" : "Reject"}
        </button>
      )}
    </div>
  );
}
