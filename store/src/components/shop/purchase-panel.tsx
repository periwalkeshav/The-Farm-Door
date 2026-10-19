"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { addToCartAction, checkPincodeAction, type AddToCartState, type PincodeCheck } from "@/actions/cart";
import { Price, cn } from "@/components/ui";
import { formatINR, formatWeight } from "@/lib/money";

export type PanelVariant = {
  id: number;
  title: string;
  optionValues: Record<string, string>;
  pricePaise: number;
  mrpPaise: number;
  netWeightGrams: number;
  sellable: number;
  shelfLife: string;
};

type Props = {
  options: { name: string; values: string[] }[];
  variants: PanelVariant[];
  freeShippingThresholdPaise: number | null;
  codEnabled: boolean;
};

function matches(v: PanelVariant, selected: Record<string, string>) {
  return Object.entries(selected).every(([k, val]) => v.optionValues[k] === val);
}

function formatEta(iso: string | null, days: number | null) {
  if (iso) {
    const d = new Date(`${iso}T12:00:00+05:30`);
    return `by ${d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`;
  }
  return days ? `in about ${days} day${days === 1 ? "" : "s"}` : null;
}

export function PurchasePanel({ options, variants, freeShippingThresholdPaise, codEnabled }: Props) {
  const initial = variants.find((v) => v.sellable > 0) ?? variants[0];
  const [selected, setSelected] = useState<Record<string, string>>(() => ({ ...initial.optionValues }));
  const variant = useMemo(() => variants.find((v) => matches(v, selected)) ?? null, [variants, selected]);
  const [quantity, setQuantity] = useState(1);
  const [state, formAction, adding] = useActionState<AddToCartState, FormData>(addToCartAction, null);

  const [pincode, setPincode] = useState("");
  const [check, setCheck] = useState<PincodeCheck | null>(null);
  const [checking, startCheck] = useTransition();

  function choose(option: string, value: string) {
    const next = { ...selected, [option]: value };
    // If that exact combination doesn't exist, keep the new choice and pick the closest valid variant.
    if (!variants.some((v) => matches(v, next))) {
      const fallback = variants.find((v) => v.optionValues[option] === value && v.sellable > 0) ?? variants.find((v) => v.optionValues[option] === value);
      if (fallback) {
        setSelected({ ...fallback.optionValues });
        setCheck(null);
        return;
      }
    }
    setSelected(next);
    setCheck(null);
    setQuantity(1);
  }

  function valueState(option: string, value: string) {
    const candidate = { ...selected, [option]: value };
    const v = variants.find((x) => matches(x, candidate));
    if (!v) return "missing" as const;
    return v.sellable > 0 ? ("ok" as const) : ("soldout" as const);
  }

  const maxQty = variant ? Math.max(1, Math.min(variant.sellable, 20)) : 1;
  const soldOut = !variant || variant.sellable === 0;

  return (
    <div>
      {variant ? (
        <Price pricePaise={variant.pricePaise} mrpPaise={variant.mrpPaise} netWeightGrams={variant.netWeightGrams} size="lg" />
      ) : (
        <p className="text-muted">This combination isn&apos;t available.</p>
      )}

      <div className="mt-6 space-y-5">
        {options.map((o) => (
          <fieldset key={o.name}>
            <legend className="mb-2 text-sm font-semibold text-forest">
              {o.name}: <span className="font-normal text-muted">{selected[o.name]}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {o.values.map((value) => {
                const st = valueState(o.name, value);
                const active = selected[o.name] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => choose(o.name, value)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                      active ? "border-forest bg-forest text-ivory" : "border-line bg-paper text-forest hover:border-forest",
                      st !== "ok" && !active && "text-muted line-through decoration-1",
                      st === "missing" && "opacity-50",
                    )}
                  >
                    {value}
                    {st === "soldout" && <span className="sr-only"> (sold out)</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <form action={formAction} className="mt-6">
        <input type="hidden" name="variantId" value={variant?.id ?? ""} />
        <input type="hidden" name="quantity" value={quantity} />
        <div className="flex gap-3">
          <div className="flex items-center rounded-full border border-line bg-paper" aria-label="Quantity">
            <button type="button" className="grid size-11 place-items-center text-xl text-forest disabled:opacity-40" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1 || soldOut} aria-label="Decrease quantity">
              −
            </button>
            <span className="w-8 text-center font-semibold" aria-live="polite">
              {quantity}
            </span>
            <button type="button" className="grid size-11 place-items-center text-xl text-forest disabled:opacity-40" onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} disabled={quantity >= maxQty || soldOut} aria-label="Increase quantity">
              +
            </button>
          </div>
          <button type="submit" disabled={soldOut || adding} className="flex-1 rounded-full bg-forest px-6 py-3 font-bold text-ivory transition hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-60">
            {soldOut ? "Sold out" : adding ? "Adding…" : "Add to cart"}
          </button>
        </div>
        {variant && variant.sellable > 0 && variant.sellable <= 5 && <p className="mt-2 text-sm font-semibold text-chilli">Only {variant.sellable} left</p>}
        {state && (
          <p role="status" className={cn("mt-3 text-sm font-semibold", state.ok ? "text-forest" : "text-chilli")}>
            {state.message}{" "}
            {state.ok && (
              <Link href="/cart" className="underline">
                View cart{state.count ? ` (${state.count})` : ""}
              </Link>
            )}
          </p>
        )}
      </form>

      <div className="mt-6 rounded-2xl border border-line bg-paper p-4">
        <p className="text-sm font-semibold text-forest">Check delivery to your pincode</p>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!variant) return;
            startCheck(async () => setCheck(await checkPincodeAction(pincode, variant.id)));
          }}
        >
          <label htmlFor="pdp-pincode" className="sr-only">
            Pincode
          </label>
          <input
            id="pdp-pincode"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            pattern="[0-9]{6}"
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit pincode"
            className="field flex-1"
          />
          <button type="submit" disabled={checking || pincode.length !== 6 || !variant} className="rounded-xl border border-forest px-4 font-semibold text-forest disabled:opacity-50">
            {checking ? "Checking…" : "Check"}
          </button>
        </form>
        {check && (
          <div className="mt-3 text-sm" role="status">
            {check.status === "OK" ? (
              <>
                <p className="font-semibold text-forest">
                  Delivers to {pincode} {formatEta(check.etaDate, check.etaDays) ?? ""}
                </p>
                <p className="mt-1 text-muted">
                  Shipping for this item: {check.shippingPaise ? formatINR(check.shippingPaise) : "free"} ({check.courier}). Your final shipping is worked out for the whole cart at checkout
                  {freeShippingThresholdPaise !== null ? `; free above ${formatINR(freeShippingThresholdPaise)}` : ""}.
                </p>
                {check.simulated && <p className="mt-1 text-xs font-semibold text-chilli">Test mode: this is a simulated courier estimate, not a real quote.</p>}
              </>
            ) : (
              <p className="font-semibold text-chilli">{check.message}</p>
            )}
          </div>
        )}
      </div>

      <ul className="mt-5 space-y-1.5 text-sm text-muted">
        <li>• Secure payment by UPI, card or net banking{codEnabled ? ", or cash on delivery" : ""}</li>
        <li>• Prices include GST{variant ? ` · Net quantity ${formatWeight(variant.netWeightGrams)}` : ""}</li>
        {variant?.shelfLife && <li>• {variant.shelfLife}</li>}
      </ul>
    </div>
  );
}
