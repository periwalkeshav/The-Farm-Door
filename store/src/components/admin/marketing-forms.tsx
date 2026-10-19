"use client";

import { useActionState, useState, useTransition } from "react";
import { moderateReviewAction, saveCouponAction, type MarketingResult } from "@/actions/admin/marketing";

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
};

export function CouponForm({ coupon, products, categories }: { coupon: CouponValues; products: { id: number; name: string }[]; categories: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<MarketingResult, FormData>(saveCouponAction.bind(null, coupon.id), null);
  const [type, setType] = useState(coupon.type);
  const [scope, setScope] = useState(coupon.scope);
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="cp-code" className="label">
            Code
          </label>
          <input id="cp-code" name="code" defaultValue={coupon.code} required className="field uppercase" placeholder="DIWALI15" />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="cp-desc" className="label">
            Description (shown to the customer when applied)
          </label>
          <input id="cp-desc" name="description" defaultValue={coupon.description} className="field" placeholder="15% off for Diwali" />
        </div>
        <div>
          <label htmlFor="cp-type" className="label">
            Type
          </label>
          <select id="cp-type" name="type" value={type} onChange={(e) => setType(e.target.value as CouponValues["type"])} className="field">
            <option value="PERCENT">Percentage off</option>
            <option value="FIXED">Fixed amount off</option>
            <option value="FREE_SHIPPING">Free shipping</option>
          </select>
        </div>
        {type !== "FREE_SHIPPING" && (
          <div>
            <label htmlFor="cp-value" className="label">
              {type === "PERCENT" ? "Percent off" : "Amount off (₹)"}
            </label>
            <input id="cp-value" name="value" defaultValue={coupon.value} inputMode="decimal" required className="field" />
          </div>
        )}
        {type === "PERCENT" && (
          <div>
            <label htmlFor="cp-max" className="label">
              Maximum discount ₹ (optional)
            </label>
            <input id="cp-max" name="maxDiscount" defaultValue={coupon.maxDiscount} inputMode="decimal" className="field" />
          </div>
        )}
        <div>
          <label htmlFor="cp-min" className="label">
            Minimum order ₹ (optional)
          </label>
          <input id="cp-min" name="minOrder" defaultValue={coupon.minOrder} inputMode="decimal" className="field" />
        </div>
        <div>
          <label htmlFor="cp-total" className="label">
            Total uses allowed (optional)
          </label>
          <input id="cp-total" name="usageLimitTotal" defaultValue={coupon.usageLimitTotal} inputMode="numeric" className="field" />
        </div>
        <div>
          <label htmlFor="cp-per" className="label">
            Uses per customer (optional)
          </label>
          <input id="cp-per" name="usageLimitPerCustomer" defaultValue={coupon.usageLimitPerCustomer} inputMode="numeric" className="field" />
        </div>
        <div>
          <label htmlFor="cp-start" className="label">
            Starts on (optional)
          </label>
          <input id="cp-start" type="date" name="startsOn" defaultValue={coupon.startsOn} className="field" />
        </div>
        <div>
          <label htmlFor="cp-end" className="label">
            Ends after (optional)
          </label>
          <input id="cp-end" type="date" name="endsOn" defaultValue={coupon.endsOn} className="field" />
        </div>
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
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={coupon.isActive} className="size-4 accent-forest" /> Active
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-forest px-6 py-2.5 font-semibold text-ivory disabled:opacity-60">
          {pending ? "Saving…" : coupon.id ? "Save coupon" : "Create coupon"}
        </button>
        {state && <span className={`text-sm font-semibold ${state.ok ? "text-forest" : "text-chilli"}`}>{state.message}</span>}
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
