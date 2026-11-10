"use client";

/**
 * "Categories ▾" in the desktop header: a button that opens the list of
 * categories, so the header fits however many there are. Closes on Escape
 * (focus goes back to the button), on a click outside, or when a link is chosen.
 */
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export function CategoryMenu({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div
      ref={box}
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap text-forest/85 hover:bg-forest/5 hover:text-forest"
      >
        {label}
        <svg viewBox="0 0 20 20" className={`size-4 transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <ul id={id} hidden={!open} className="absolute top-full left-0 z-50 mt-2 min-w-52 rounded-2xl border border-line bg-paper p-2 shadow-[0_18px_40px_-20px_rgba(31,59,45,.45)]">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap text-forest hover:bg-forest/5">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
