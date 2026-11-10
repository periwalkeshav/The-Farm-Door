"use client";

/**
 * Bottom of a product card: the price, a dropdown of every pack (each option
 * combination, e.g. "Jar · 200 g") and an "Add to cart" button, so shoppers
 * can buy without opening the product. The price follows the chosen pack.
 *
 * The dropdown is the browser's own (phones show their native picker), laid
 * invisibly over a box that shows the chosen pack, so long names can wrap
 * onto two lines on narrow phones instead of being cut off.
 */
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { addToCartAction } from "@/actions/cart";
import { Price } from "@/components/ui";
import type { ProductCard } from "@/server/catalog/queries";
import { useI18n } from "@/i18n/client";
import { translateParts } from "@/i18n/translate";
import { announceAdded } from "./cart-feedback";

export function QuickAdd({ product }: { product: Pick<ProductCard, "name" | "slug" | "packs" | "defaultPack"> }) {
  const { lang, t, href } = useI18n();
  const id = useId();
  const [index, setIndex] = useState(Math.max(0, product.defaultPack));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pack = product.packs[index];
  if (!pack) return null;
  const label = (text: string) => translateParts(lang, text);
  // On screen, "100 g" and "1 L" never split across lines.
  const shown = (text: string) => label(text).replace(/(\d) (g|kg|ml|L)\b/g, "$1\u00a0$2");

  function add() {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("variantId", String(pack.variantId));
      fd.set("quantity", "1");
      const r = await addToCartAction(null, fd);
      if (r?.ok) announceAdded({ message: t("{name}, {pack} added", { name: product.name, pack: label(pack.label) }), count: r.count });
      else setError(t(r?.message ?? "Couldn't add. Please try again."));
    });
  }

  return (
    <div className="relative z-10 mt-auto pt-2">
      <Price pricePaise={pack.pricePaise} mrpPaise={pack.mrpPaise} size="sm" lang={lang} />
      {product.packs.length > 1 ? (
        <div className="relative mt-2 flex min-h-10 items-center rounded-xl border border-forest/35 bg-paper py-1.5 pr-8 pl-3 transition focus-within:border-forest focus-within:ring-4 focus-within:ring-saffron/25 hover:border-forest">
          <label htmlFor={`${id}-pack`} className="sr-only">
            {t("Pack size for {name}", { name: product.name })}
          </label>
          <span aria-hidden="true" className="line-clamp-2 text-sm leading-snug font-semibold text-forest">
            {shown(pack.label)}
            {pack.inStock ? "" : ` (${t("sold out")})`}
          </span>
          <select
            id={`${id}-pack`}
            value={index}
            onChange={(e) => {
              setIndex(Number(e.target.value));
              setError(null);
            }}
            // Invisible but tappable over the whole box. 16 px text so iPhones don't zoom in when it's tapped.
            className="absolute inset-0 size-full cursor-pointer appearance-none rounded-xl text-base opacity-0"
          >
            {product.packs.map((p, i) => (
              <option key={p.variantId} value={i}>
                {label(p.label)}
                {p.inStock ? "" : ` (${t("sold out")})`}
              </option>
            ))}
          </select>
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-forest" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      ) : (
        <p className="mt-2 flex h-10 items-center text-sm font-semibold text-forest">{shown(pack.label)}</p>
      )}
      <div className="mt-2">
        {pack.inStock ? (
          <button
            type="button"
            onClick={add}
            disabled={pending}
            aria-label={t("Add to cart: {name}, {pack}", { name: product.name, pack: label(pack.label) })}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-forest px-3 text-sm font-bold text-ivory transition hover:bg-forest-deep disabled:opacity-60"
          >
            {pending ? t("Adding…") : t("Add to cart")}
          </button>
        ) : (
          <Link
            href={`${href(`/products/${product.slug}`)}?pack=${pack.variantId}`}
            className="flex min-h-11 items-center justify-center rounded-xl border border-line px-3 text-center text-sm font-semibold text-muted hover:border-forest hover:text-forest"
          >
            {t("Sold out · notify me")}
          </Link>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-chilli">
          {error}
        </p>
      )}
    </div>
  );
}
