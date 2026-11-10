"use client";

import { useActionState, useState, useTransition } from "react";
import { applyCouponAction, removeCouponAction, setCartPincodeAction, updateQuantityAction, type CouponState } from "@/actions/cart";
import { lookupPincodeAction } from "@/actions/checkout";
import { FieldError, useForm } from "@/components/form";
import { couponCodeSchema } from "@/lib/form-schemas";
import { isValidPincode } from "@/lib/india";
import { useI18n } from "@/i18n/client";
import { rememberPincode } from "./pincode";

export function QuantityControl({ variantId, quantity, max }: { variantId: number; quantity: number; max: number }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const set = (q: number) => start(() => updateQuantityAction(variantId, q));
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center rounded-full border border-line bg-paper" aria-label={t("Quantity")} aria-busy={pending}>
        <button type="button" onClick={() => set(quantity - 1)} disabled={pending || quantity <= 1} className="grid size-9 place-items-center text-lg text-forest disabled:opacity-40" aria-label={t("Decrease quantity")}>
          −
        </button>
        <span className="w-7 text-center text-sm font-semibold">{quantity}</span>
        <button type="button" onClick={() => set(quantity + 1)} disabled={pending || quantity >= Math.min(max, 20)} className="grid size-9 place-items-center text-lg text-forest disabled:opacity-40" aria-label={t("Increase quantity")}>
          +
        </button>
      </div>
      <button type="button" onClick={() => set(0)} disabled={pending} className="text-sm font-semibold text-muted underline hover:text-chilli">
        {t("Remove")}
      </button>
    </div>
  );
}

export function CouponForm({ code, ok, message }: { code: string | null; ok: boolean; message: string | null }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<CouponState, FormData>(applyCouponAction, null);
  const f = useForm({ schema: couponCodeSchema, action });
  const [removing, start] = useTransition();
  if (code) {
    return (
      <div className="rounded-xl border border-line bg-paper p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span>
            {t("Code")} <strong className="text-forest">{code}</strong> {ok ? t("applied") : t("not applied")}
          </span>
          <button type="button" onClick={() => start(() => removeCouponAction())} disabled={removing} className="font-semibold text-muted underline">
            {t("Remove")}
          </button>
        </div>
        {message && <p className={ok ? "mt-1 text-muted" : "mt-1 font-semibold text-chilli"}>{t(message)}</p>}
      </div>
    );
  }
  return (
    <form {...f.formProps}>
      <label htmlFor={f.id("code")} className="label">
        {t("Discount code")}
      </label>
      <div className="flex gap-2">
        <input {...f.field("code")} autoComplete="off" maxLength={30} className="field flex-1 uppercase" placeholder={t("Enter code")} />
        <button type="submit" disabled={pending} className="rounded-xl border border-forest px-4 font-semibold text-forest disabled:opacity-50">
          {pending ? "…" : t("Apply")}
        </button>
      </div>
      <FieldError f={f} name="code" />
      {state && !f.error("code") && <p className={state.ok ? "mt-1 text-sm text-forest" : "mt-1 text-sm font-semibold text-chilli"}>{t(state.message)}</p>}
    </form>
  );
}

export function CartPincode({ pincode }: { pincode: string | null }) {
  const { t } = useI18n();
  const [value, setValue] = useState(pincode ?? "");
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await setCartPincodeAction(value);
          // The header's "Deliver to" follows the pincode entered here.
          const place = await lookupPincodeAction(value).catch(() => null);
          rememberPincode(value, place?.city ?? "");
        });
      }}
    >
      <label htmlFor="cart-pincode" className="label">
        {t("Delivery pincode")}
      </label>
      <div className="flex gap-2">
        <input
          id="cart-pincode"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="field flex-1"
          placeholder={t("6-digit pincode")}
        />
        <button type="submit" disabled={pending || !isValidPincode(value)} className="rounded-xl border border-forest px-4 font-semibold text-forest disabled:opacity-50">
          {pending ? "…" : t("Update")}
        </button>
      </div>
      {value.length === 6 && !isValidPincode(value) && <p className="mt-1 text-sm font-semibold text-chilli">{t("Indian pincodes don't start with 0.")}</p>}
    </form>
  );
}
