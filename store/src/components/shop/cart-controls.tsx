"use client";

import { useActionState, useState, useTransition } from "react";
import { applyCouponAction, removeCouponAction, setCartPincodeAction, updateQuantityAction, type CouponState } from "@/actions/cart";

export function QuantityControl({ variantId, quantity, max }: { variantId: number; quantity: number; max: number }) {
  const [pending, start] = useTransition();
  const set = (q: number) => start(() => updateQuantityAction(variantId, q));
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center rounded-full border border-line bg-paper" aria-label="Quantity" aria-busy={pending}>
        <button type="button" onClick={() => set(quantity - 1)} disabled={pending || quantity <= 1} className="grid size-9 place-items-center text-lg text-forest disabled:opacity-40" aria-label="Decrease quantity">
          −
        </button>
        <span className="w-7 text-center text-sm font-semibold">{quantity}</span>
        <button type="button" onClick={() => set(quantity + 1)} disabled={pending || quantity >= Math.min(max, 20)} className="grid size-9 place-items-center text-lg text-forest disabled:opacity-40" aria-label="Increase quantity">
          +
        </button>
      </div>
      <button type="button" onClick={() => set(0)} disabled={pending} className="text-sm font-semibold text-muted underline hover:text-chilli">
        Remove
      </button>
    </div>
  );
}

export function CouponForm({ code, ok, message }: { code: string | null; ok: boolean; message: string | null }) {
  const [state, action, pending] = useActionState<CouponState, FormData>(applyCouponAction, null);
  const [removing, start] = useTransition();
  if (code) {
    return (
      <div className="rounded-xl border border-line bg-paper p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span>
            Code <strong className="text-forest">{code}</strong> {ok ? "applied" : "not applied"}
          </span>
          <button type="button" onClick={() => start(() => removeCouponAction())} disabled={removing} className="font-semibold text-muted underline">
            Remove
          </button>
        </div>
        {message && <p className={ok ? "mt-1 text-muted" : "mt-1 font-semibold text-chilli"}>{message}</p>}
      </div>
    );
  }
  return (
    <form action={action}>
      <label htmlFor="coupon" className="label">
        Discount code
      </label>
      <div className="flex gap-2">
        <input id="coupon" name="code" autoComplete="off" className="field flex-1 uppercase" placeholder="Enter code" />
        <button type="submit" disabled={pending} className="rounded-xl border border-forest px-4 font-semibold text-forest disabled:opacity-50">
          {pending ? "…" : "Apply"}
        </button>
      </div>
      {state && <p className={state.ok ? "mt-1 text-sm text-forest" : "mt-1 text-sm font-semibold text-chilli"}>{state.message}</p>}
    </form>
  );
}

export function CartPincode({ pincode }: { pincode: string | null }) {
  const [value, setValue] = useState(pincode ?? "");
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(() => setCartPincodeAction(value));
      }}
    >
      <label htmlFor="cart-pincode" className="label">
        Delivery pincode
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
          placeholder="6-digit pincode"
        />
        <button type="submit" disabled={pending || value.length !== 6} className="rounded-xl border border-forest px-4 font-semibold text-forest disabled:opacity-50">
          {pending ? "…" : "Update"}
        </button>
      </div>
    </form>
  );
}
