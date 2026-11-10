"use client";

/**
 * Search input with suggestions as you type (products and categories), as an
 * accessible combobox: arrow keys move through suggestions, Enter opens the
 * highlighted one (or searches), Escape closes the list. Works as a plain
 * search field without JavaScript.
 */
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { mediaUrl } from "@/lib/media-url";
import { formatINR } from "@/lib/money";
import { useI18n } from "@/i18n/client";
import { translateParts } from "@/i18n/translate";
import { useMotionPaused } from "./motion";

type Suggestions = {
  products: { slug: string; name: string; imageId: number | null; pricePaise: number; fromLabel: string; inStock: boolean }[];
  categories: { slug: string; name: string }[];
  didYouMean: string | null;
};

type Option = { key: string; href: string; label: string; sub?: string; imageId?: number | null; kind: "product" | "category" | "search" };

export function SearchBox({
  name = "q",
  defaultValue = "",
  placeholder,
  className,
  inputClassName,
  autoFocus,
  label,
  hints,
}: {
  name?: string;
  defaultValue?: string;
  placeholder: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  label: string;
  /** Example searches the empty box cycles through ("Search haldi…", "Search jeera…"). */
  hints?: string[];
}) {
  const router = useRouter();
  const { lang, t, href } = useI18n();
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [data, setData] = useState<Suggestions | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const abort = useRef<AbortController | null>(null);
  const [focused, setFocused] = useState(false);
  const [hint, setHint] = useState(0);
  const motionPaused = useMotionPaused();
  const cycling = !!hints && hints.length > 1 && !value && !focused && !motionPaused;

  useEffect(() => {
    if (!cycling) return;
    const timer = setInterval(() => setHint((h) => (h + 1) % hints!.length), 2600);
    return () => clearInterval(timer);
  }, [cycling, hints]);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      abort.current?.abort();
      return;
    }
    const timer = setTimeout(async () => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&lang=${lang}`, { signal: controller.signal });
        if (res.ok) {
          setData((await res.json()) as Suggestions);
          setActive(-1);
        }
      } catch {
        // Aborted or offline: keep the plain search working.
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [value, lang]);

  const q = value.trim();
  const options: Option[] =
    q.length < 2 || !data
      ? []
      : [
          ...data.products.map((p) => ({
            key: `p-${p.slug}`,
            href: href(`/products/${p.slug}`),
            label: p.name,
            sub: `${p.inStock ? t("From {price}", { price: formatINR(p.pricePaise) }) : t("Sold out")} · ${translateParts(lang, p.fromLabel)}`,
            imageId: p.imageId,
            kind: "product" as const,
          })),
          ...data.categories.map((c) => ({ key: `c-${c.slug}`, href: href(`/category/${c.slug}`), label: c.name, sub: t("Category"), kind: "category" as const })),
          ...(data.didYouMean ? [{ key: "dym", href: `${href("/shop")}?q=${encodeURIComponent(data.didYouMean)}`, label: t("Did you mean “{q}”?", { q: data.didYouMean }), kind: "search" as const }] : []),
          { key: "all", href: `${href("/shop")}?q=${encodeURIComponent(q)}`, label: t("See all results for “{q}”", { q }), kind: "search" as const },
        ];
  const expanded = open && options.length > 0;
  const optionId = (i: number) => `${id}-opt-${i}`;

  function go(option: Option) {
    setOpen(false);
    router.push(option.href);
  }

  return (
    <div className={cn("relative", className)}>
      <label htmlFor={`${id}-input`} className="sr-only">
        {label}
      </label>
      <input
        id={`${id}-input`}
        name={name}
        type="search"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        placeholder={hints?.length ? t("Search {example}…", { example: hints[hint % hints.length] }) : placeholder}
        maxLength={80}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setFocused(true);
        }}
        onBlur={() => {
          setOpen(false);
          setFocused(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && options.length) {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (a + 1) % options.length);
          } else if (e.key === "ArrowUp" && options.length) {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
          } else if (e.key === "Escape") {
            if (expanded) e.preventDefault();
            setOpen(false);
            setActive(-1);
          } else if (e.key === "Enter" && expanded && active >= 0) {
            e.preventDefault();
            go(options[active]);
          }
        }}
        className={inputClassName}
      />
      <ul id={`${id}-list`} role="listbox" aria-label={t("Suggestions")} hidden={!expanded} className="absolute inset-x-0 top-full z-50 mt-1 max-h-[70vh] min-w-72 overflow-y-auto rounded-2xl border border-line bg-paper py-1 shadow-[0_18px_40px_-20px_rgba(31,59,45,.45)]">
        {options.map((o, i) => (
          <li
            key={o.key}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            // Keep focus in the input so the list doesn't close before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => go(o)}
            onMouseEnter={() => setActive(i)}
            className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-sm", i === active && "bg-sand/70", o.kind === "search" && "font-semibold text-forest")}
          >
            {o.kind === "product" &&
              (o.imageId ? (
                // eslint-disable-next-line @next/next/no-img-element -- small pre-sized WebP from /media
                <img src={mediaUrl(o.imageId, "small")!} alt="" width={40} height={40} className="size-10 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="size-10 shrink-0 rounded-lg bg-sand" />
              ))}
            <span className="min-w-0">
              <span className="block truncate font-semibold text-forest">{o.label}</span>
              {o.sub && <span className="block truncate text-xs text-muted">{o.sub}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        {expanded ? t(options.length === 2 ? "{count} suggestion. Use the arrow keys to choose." : "{count} suggestions. Use the arrow keys to choose.", { count: options.length - 1 }) : ""}
      </p>
    </div>
  );
}
