"use client";

/**
 * "Often bought together": this product plus a few others, each with a tick
 * box, a running total and one button to add the ticked ones to the cart.
 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { addManyToCartAction } from "@/actions/cart";
import { cn } from "@/components/ui";
import { mediaUrl } from "@/lib/media-url";
import { formatINR } from "@/lib/money";
import { useI18n } from "@/i18n/client";
import { translateParts } from "@/i18n/translate";
import { announceAdded } from "./cart-feedback";

export type BundleItem = { variantId: number; slug: string; name: string; packLabel: string; pricePaise: number; mrpPaise: number; imageId: number | null; current?: boolean };

export function BundleBuilder({ items }: { items: BundleItem[] }) {
  const { lang, t, href } = useI18n();
  const [ticked, setTicked] = useState(() => new Set(items.map((i) => i.variantId)));
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const chosen = items.filter((i) => ticked.has(i.variantId));
  const total = chosen.reduce((s, i) => s + i.pricePaise, 0);
  const mrpTotal = chosen.reduce((s, i) => s + i.mrpPaise, 0);

  function toggle(id: number) {
    setResult(null);
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="card grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_280px] lg:items-center">
      <ul className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-4">
        {items.map((item, i) => (
          <li key={item.variantId} className="relative">
            {i > 0 && (
              <span aria-hidden="true" className="absolute top-12 -left-3 z-[1] hidden size-6 place-items-center rounded-full bg-forest text-sm font-bold text-ivory md:grid">
                +
              </span>
            )}
            <label className={cn("relative flex h-full cursor-pointer flex-col items-center gap-2 rounded-2xl border p-3 pt-4 text-center transition", ticked.has(item.variantId) ? "border-forest bg-sage-soft/50" : "border-line opacity-70")}>
              <input type="checkbox" checked={ticked.has(item.variantId)} onChange={() => toggle(item.variantId)} className="absolute top-3 left-3 size-4 accent-forest" />
              {item.current && <span className="absolute top-2.5 right-2.5 rounded-full bg-forest px-2 py-0.5 text-[10px] font-bold text-ivory uppercase">{t("This item")}</span>}
              <span className="size-20 shrink-0 overflow-hidden rounded-xl bg-sand">
                {item.imageId && (
                  // eslint-disable-next-line @next/next/no-img-element -- small pre-sized WebP from /media
                  <img src={mediaUrl(item.imageId, "small")!} alt="" width={80} height={80} loading="lazy" className="size-full object-cover" />
                )}
              </span>
              <span className="text-sm">
                <span className="block font-semibold text-forest">{item.name}</span>
                <span className="block text-xs text-muted">{translateParts(lang, item.packLabel)}</span>
                <span className="mt-1 block font-bold">{formatINR(item.pricePaise)}</span>
              </span>
            </label>
            {!item.current && (
              <Link href={href(`/products/${item.slug}`)} className="mt-1 block text-center text-xs font-semibold text-forest underline">
                {t("View {name}", { name: item.name })}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <div className="rounded-2xl bg-ivory p-4 text-center">
        <p className="text-sm text-muted">
          {t(chosen.length === 1 ? "Total for {count} item" : "Total for {count} items", { count: chosen.length })}
        </p>
        <p className="mt-1 font-display text-3xl font-semibold text-forest">
          {formatINR(total)}
          {mrpTotal > total && <span className="ml-2 align-middle text-base font-normal text-muted line-through">{formatINR(mrpTotal)}</span>}
        </p>
        <button
          type="button"
          disabled={pending || chosen.length === 0}
          onClick={() =>
            start(async () => {
              const r = await addManyToCartAction(chosen.map((i) => i.variantId));
              const message = t(r.message);
              setResult({ ok: r.ok, message: r.failed.length && r.ok ? `${message}. ${t("Not added:")} ${r.failed.map((f) => t(f)).join(" ")}` : message });
              if (r.ok) announceAdded({ message, count: r.count });
            })
          }
          className="mt-3 w-full rounded-full bg-forest px-5 py-3 font-bold text-ivory hover:bg-forest-deep disabled:opacity-60"
        >
          {pending ? t("Adding…") : chosen.length > 1 ? t("Add all {count} to cart", { count: chosen.length }) : t("Add to cart")}
        </button>
        {result && (
          <p role="status" className={cn("mt-2 text-sm font-semibold", result.ok ? "text-forest" : "text-chilli")}>
            {result.message}
          </p>
        )}
      </div>
    </div>
  );
}
