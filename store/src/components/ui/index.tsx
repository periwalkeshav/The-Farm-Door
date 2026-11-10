import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { translator } from "@/i18n/translate";
import { discountPercent, formatINR, pricePer100 } from "@/lib/money";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "saffron";
type Size = "sm" | "md" | "lg";

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60",
    size === "sm" && "px-3.5 py-1.5 text-sm",
    size === "md" && "px-5 py-2.5 text-[15px]",
    size === "lg" && "px-6 py-3.5 text-base",
    variant === "primary" && "bg-forest text-ivory hover:bg-forest-deep",
    variant === "saffron" && "bg-saffron text-forest-deep hover:brightness-95",
    variant === "secondary" && "border border-forest/25 bg-paper text-forest hover:border-forest",
    variant === "ghost" && "text-forest hover:bg-forest/5",
    variant === "danger" && "border border-chilli/30 bg-paper text-chilli hover:bg-chilli-soft",
    extra,
  );
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant, size, className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm leading-relaxed",
        tone === "info" && "border-line bg-paper text-ink",
        tone === "warn" && "border-saffron/40 bg-[#fdf3e1] text-[#6b4510]",
        tone === "error" && "border-chilli/30 bg-chilli-soft text-[#7a2615]",
        tone === "success" && "border-sage/40 bg-sage-soft text-forest",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** `netQuantity` (in grams, or millilitres when `netUnit` is "ml") adds the price per 100 g / 100 ml. */
export function Price({
  pricePaise,
  mrpPaise,
  netQuantity,
  netUnit = "g",
  size = "md",
  lang = "en",
}: {
  pricePaise: number;
  mrpPaise: number;
  netQuantity?: number;
  netUnit?: "g" | "ml";
  size?: "sm" | "md" | "lg";
  lang?: Locale;
}) {
  const t = translator(lang);
  const off = discountPercent(pricePaise, mrpPaise);
  const per100 = netQuantity ? pricePer100(pricePaise, netQuantity) : null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={cn("font-bold text-forest", size === "lg" ? "text-3xl" : size === "md" ? "text-lg" : "text-base")}>{formatINR(pricePaise)}</span>
      {off > 0 && (
        <>
          <span className={cn("text-muted line-through", size === "lg" ? "text-base" : "text-sm")}>
            <span className="sr-only">{t("MRP")} </span>
            {formatINR(mrpPaise)}
          </span>
          <span className={cn("font-semibold text-chilli", size === "lg" ? "text-base" : "text-sm")}>{t("{percent}% off", { percent: off })}</span>
        </>
      )}
      {per100 !== null && <span className="w-full text-xs text-muted">{t("{price} / 100 {unit} · MRP incl. of all taxes", { price: formatINR(per100), unit: netUnit })}</span>}
    </div>
  );
}

export function Stars({ rating, count, size = 14, lang = "en" }: { rating: number; count?: number; size?: number; lang?: Locale }) {
  const t = translator(lang);
  const label = `${t("{rating} out of 5", { rating: rating.toFixed(1) })}${count !== undefined ? `, ${t(count === 1 ? "{count} review" : "{count} reviews", { count })}` : ""}`;
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={label}>
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <svg key={i} width={size} height={size} viewBox="0 0 20 20" className={i <= Math.round(rating) ? "fill-saffron" : "fill-line"}>
            <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L10 15l-5.2 2.7 1-5.9L1.5 7.7l5.9-.8z" />
          </svg>
        ))}
      </span>
      {count !== undefined && <span className="text-xs text-muted">({count})</span>}
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  // Placeholder mark until the official logo file is supplied.
  return (
    <span className={cn("inline-flex items-center gap-2 text-forest", className)}>
      <svg viewBox="0 0 40 40" className="size-8 shrink-0" aria-hidden="true">
        <path d="M8.5 35V18.5a11.5 11.5 0 0 1 23 0V35" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <circle cx="20" cy="23" r="4.6" fill="#E3A33B" />
        <path d="M11 30.5c3.6-2.6 7.4-2.8 10.4-1.4 2.6 1.2 5 1.1 7.6-.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M5 35h30" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      {/* A size smaller on the narrowest phones, so the header icons fit beside it. */}
      <span className="font-display text-lg font-semibold tracking-tight min-[400px]:text-xl">The Farm Door</span>
    </span>
  );
}

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-bold tracking-[.14em] text-saffron-deep uppercase">{eyebrow}</p>}
        <h2 className="text-2xl sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-sand", className)} />;
}
