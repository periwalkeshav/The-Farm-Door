"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { addToCartAction, checkPincodeAction, type AddToCartState, type PincodeCheck } from "@/actions/cart";
import { Price, cn } from "@/components/ui";
import { isValidPincode } from "@/lib/india";
import { dateLocale, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { translateParts, translator } from "@/i18n/translate";
import { announceAdded } from "./cart-feedback";
import { savePincode, useSavedPincode } from "./pincode";
import { StockAlertForm } from "./stock-alert-form";
import { discountPercent, formatINR, formatQuantity, pricePer100 } from "@/lib/money";

export type PanelVariant = {
  id: number;
  title: string;
  optionValues: Record<string, string>;
  pricePaise: number;
  mrpPaise: number;
  netWeightGrams: number;
  sellable: number;
  shelfLife: string;
  sale?: { name: string; endsAt: Date } | null;
};

type Props = {
  productName: string;
  /** "ml" for products sold by volume (oils): prices per 100 ml and quantities in ml / L. */
  netUnit?: "g" | "ml";
  options: { name: string; values: string[] }[];
  variants: PanelVariant[];
  freeShippingThresholdPaise: number | null;
};

function matches(v: PanelVariant, selected: Record<string, string>) {
  return Object.entries(selected).every(([k, val]) => v.optionValues[k] === val);
}

function formatEta(lang: Locale, iso: string | null, days: number | null) {
  const t = translator(lang);
  if (iso) {
    const d = new Date(`${iso}T12:00:00+05:30`);
    return t("by {date}", { date: d.toLocaleDateString(dateLocale(lang), { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) });
  }
  return days ? t(days === 1 ? "in about {days} day" : "in about {days} days", { days }) : null;
}

export function PurchasePanel({ productName, netUnit = "g", options, variants, freeShippingThresholdPaise }: Props) {
  const { lang, t, href } = useI18n();
  const tp = (text: string) => translateParts(lang, text);
  const initial = variants.find((v) => v.sellable > 0) ?? variants[0];
  const [selected, setSelected] = useState<Record<string, string>>(() => ({ ...initial.optionValues }));
  const variant = useMemo(() => variants.find((v) => matches(v, selected)) ?? null, [variants, selected]);
  const [quantity, setQuantity] = useState(1);
  const [state, formAction, adding] = useActionState<AddToCartState, FormData>(addToCartAction, null);
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [formOutOfView, setFormOutOfView] = useState(false);

  // Keep the cart count in the corner up to date (the message under the button says it was added).
  useEffect(() => {
    if (state?.ok) announceAdded({ message: "Added", count: state.count, silent: true });
  }, [state]);

  // Show the sticky "Add to cart" bar once the main button has scrolled up out of view.
  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setFormOutOfView(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Links from Google Shopping name a pack (?pack=<id>). The page is cached, so the choice is read here.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("pack"));
    const linked = variants.find((v) => v.id === id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing once from the URL, an external source
    if (linked) setSelected({ ...linked.optionValues });
  }, [variants]);

  const [pincode, setPincode] = useState("");
  const [check, setCheck] = useState<PincodeCheck | null>(null);
  const [checking, startCheck] = useTransition();
  const saved = useSavedPincode();
  const [checkedFor, setCheckedFor] = useState<string | null>(null);

  // With a remembered pincode, show delivery for the chosen pack straight away.
  useEffect(() => {
    if (!saved || !variant || checkedFor === `${saved.pincode}:${variant.id}`) return;
    const key = `${saved.pincode}:${variant.id}`;
    // Following an external store (the remembered pincode) into local state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPincode(saved.pincode);
    setCheckedFor(key);
    startCheck(async () => setCheck(await checkPincodeAction(saved.pincode, variant.id)));
  }, [saved, variant, checkedFor]);

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
        <>
          <Price pricePaise={variant.pricePaise} mrpPaise={variant.mrpPaise} netQuantity={variant.netWeightGrams} netUnit={netUnit} size="lg" lang={lang} />
          {variant.sale && (
            <p className="mt-2 inline-flex rounded-full bg-chilli-soft px-3 py-1 text-xs font-bold text-[#7a2615]">
              {t("{name} price · ends {date}", { name: variant.sale.name, date: new Date(variant.sale.endsAt).toLocaleString(dateLocale(lang), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) })}
            </p>
          )}
        </>
      ) : (
        <p className="text-muted">{t("This combination isn't available.")}</p>
      )}

      <div className="mt-6 space-y-5">
        {options.map((o, oi) => (
          <fieldset key={o.name}>
            <legend className="mb-2 text-sm font-semibold text-forest">
              {t(o.name)}: <span className="font-normal text-muted">{t(selected[o.name] ?? "")}</span>
            </legend>
            {oi === options.length - 1 ? (
              <PackCards option={o.name} values={o.values} selected={selected} variants={variants} netUnit={netUnit} onChoose={(value) => choose(o.name, value)} lang={lang} />
            ) : (
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
                      // Not made in this combination: a dashed outline rather than faded text, which would be too faint to read.
                      st === "missing" && !active && "border-dashed bg-transparent",
                    )}
                  >
                    {t(value)}
                    {st === "soldout" && <span className="sr-only"> ({t("sold out")})</span>}
                  </button>
                );
              })}
            </div>
            )}
          </fieldset>
        ))}
      </div>

      <form id={formId} ref={formRef} action={formAction} className="mt-6">
        <input type="hidden" name="variantId" value={variant?.id ?? ""} />
        <input type="hidden" name="quantity" value={quantity} />
        <div className="flex gap-3">
          <div className="flex items-center rounded-full border border-line bg-paper" aria-label={t("Quantity")}>
            <button type="button" className="grid size-11 place-items-center text-xl text-forest disabled:opacity-40" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1 || soldOut} aria-label={t("Decrease quantity")}>
              −
            </button>
            <span className="w-8 text-center font-semibold" aria-live="polite">
              {quantity}
            </span>
            <button type="button" className="grid size-11 place-items-center text-xl text-forest disabled:opacity-40" onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} disabled={quantity >= maxQty || soldOut} aria-label={t("Increase quantity")}>
              +
            </button>
          </div>
          <button type="submit" disabled={soldOut || adding} className="flex-1 rounded-full bg-forest px-6 py-3 font-bold text-ivory transition hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-60">
            {t(soldOut ? "Sold out" : adding ? "Adding…" : "Add to cart")}
          </button>
        </div>
        {variant && variant.sellable > 0 && variant.sellable <= 5 && <p className="mt-2 text-sm font-semibold text-chilli">{t("Only {count} left", { count: variant.sellable })}</p>}
        {state && (
          <p role="status" className={cn("mt-3 text-sm font-semibold", state.ok ? "text-forest" : "text-chilli")}>
            {t(state.message)}{" "}
            {state.ok && (
              <Link href={href("/cart")} className="underline">
                {t("View cart")}
                {state.count ? ` (${state.count})` : ""}
              </Link>
            )}
          </p>
        )}
      </form>
      {variant && soldOut && <StockAlertForm key={variant.id} variantId={variant.id} />}

      {formOutOfView && variant && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 pr-20 shadow-[0_-12px_30px_-20px_rgba(22,48,31,.5)] backdrop-blur md:pr-0">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-semibold text-forest">{productName}</p>
              <p className="truncate text-sm text-muted">
                <span className="font-bold text-ink">{formatINR(variant.pricePaise * quantity)}</span>
                {variant.mrpPaise > variant.pricePaise && <span className="ml-1.5 line-through">{formatINR(variant.mrpPaise * quantity)}</span>} · {tp(variant.title)}
                {quantity > 1 ? ` × ${quantity}` : ""}
              </p>
            </div>
            <button type="submit" form={formId} disabled={soldOut || adding} className="shrink-0 rounded-full bg-forest px-5 py-2.5 font-bold text-ivory hover:bg-forest-deep disabled:opacity-60">
              {t(soldOut ? "Sold out" : adding ? "Adding…" : "Add to cart")}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-line bg-paper p-4">
        <p className="text-sm font-semibold text-forest">{t("Check delivery to your pincode")}</p>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!variant) return;
            setCheckedFor(`${pincode}:${variant.id}`);
            startCheck(async () => {
              const r = await checkPincodeAction(pincode, variant.id);
              setCheck(r);
              if (r.status === "OK" || r.status === "UNSERVICEABLE") savePincode(pincode, saved?.pincode === pincode ? saved.city : "");
            });
          }}
        >
          <label htmlFor="pdp-pincode" className="sr-only">
            {t("Pincode")}
          </label>
          <input
            id="pdp-pincode"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            pattern="[0-9]{6}"
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={t("6-digit pincode")}
            className="field flex-1"
          />
          <button type="submit" disabled={checking || !isValidPincode(pincode) || !variant} className="rounded-xl border border-forest px-4 font-semibold text-forest disabled:opacity-50">
            {t(checking ? "Checking…" : "Check")}
          </button>
        </form>
        {pincode.length === 6 && !isValidPincode(pincode) && <p className="mt-2 text-sm font-semibold text-chilli">{t("Indian pincodes don't start with 0.")}</p>}
        {check && (
          <div className="mt-3 text-sm" role="status">
            {check.status === "OK" ? (
              <>
                <p className="font-semibold text-forest">
                  {t("Delivers to {pincode}", { pincode })} {formatEta(lang, check.etaDate, check.etaDays) ?? ""}
                </p>
                <p className="mt-1 text-muted">
                  {t("Shipping for this item: {amount} ({courier}).", { amount: check.shippingPaise ? formatINR(check.shippingPaise) : t("free"), courier: check.courier })}{" "}
                  {t("Your final shipping is worked out for the whole cart at checkout")}
                  {freeShippingThresholdPaise !== null ? t("; free above {amount}", { amount: formatINR(freeShippingThresholdPaise) }) : ""}.
                </p>
                {check.simulated && <p className="mt-1 text-xs font-semibold text-chilli">{t("Test mode: this is a simulated courier estimate, not a real quote.")}</p>}
              </>
            ) : (
              <p className="font-semibold text-chilli">{t(check.message)}</p>
            )}
          </div>
        )}
      </div>

      <ul className="mt-5 space-y-1.5 text-sm text-muted">
        <li>
          • {t("Prices include GST")}
          {variant ? ` · ${t("Net quantity {weight}", { weight: formatQuantity(variant.netWeightGrams, netUnit) })}` : ""}
        </li>
        {variant?.shelfLife && <li>• {t(variant.shelfLife)}</li>}
      </ul>
    </div>
  );
}

/** The sizes as cards, each with its price, price per 100 g and saving against MRP. */
function PackCards({
  option,
  values,
  selected,
  variants,
  netUnit,
  onChoose,
  lang,
}: {
  option: string;
  values: string[];
  selected: Record<string, string>;
  variants: PanelVariant[];
  netUnit: "g" | "ml";
  onChoose: (value: string) => void;
  lang: Locale;
}) {
  const t = translator(lang);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {values.map((value) => {
        const v = variants.find((x) => matches(x, { ...selected, [option]: value }));
        const active = selected[option] === value;
        const off = v ? discountPercent(v.pricePaise, v.mrpPaise) : 0;
        const per100 = v ? pricePer100(v.pricePaise, v.netWeightGrams) : null;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChoose(value)}
            aria-pressed={active}
            className={cn(
              "relative rounded-2xl border px-3 pt-4 pb-3 text-left transition",
              active ? "border-forest bg-sage-soft ring-2 ring-forest" : "border-line bg-paper hover:border-forest",
              !v && !active && "border-dashed bg-transparent",
            )}
          >
            {off > 0 && v && v.sellable > 0 && <span className="absolute -top-2.5 left-3 rounded-full bg-chilli px-2 py-0.5 text-[11px] font-bold text-white">{t("Save {amount}", { amount: formatINR(v.mrpPaise - v.pricePaise) })}</span>}
            <span className={cn("block text-sm font-semibold", v ? "text-forest" : "text-muted")}>{t(value)}</span>
            {v ? (
              <>
                <span className={cn("block text-lg font-bold text-ink", v.sellable === 0 && "text-muted line-through")}>{formatINR(v.pricePaise)}</span>
                <span className="block text-xs text-muted">{v.sellable === 0 ? t("Sold out") : per100 !== null ? `${formatINR(per100)} / 100 ${netUnit}` : "\u00a0"}</span>
              </>
            ) : (
              <span className="block text-xs text-muted">{t("Not available with this choice")}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
