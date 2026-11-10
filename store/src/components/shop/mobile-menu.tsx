"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";

export function MobileMenu({ links }: { links: { href: string; label: string }[] }) {
  const { t, href } = useI18n();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="xl:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-10 place-items-center rounded-full text-forest hover:bg-forest/5"
        aria-label={t("Open menu")}
        aria-expanded={open}
        aria-controls="mobile-menu"
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50" id="mobile-menu" role="dialog" aria-modal="true" aria-label={t("Menu")}>
          <button type="button" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} aria-label={t("Close menu")} />
          <nav className="absolute inset-y-0 left-0 flex w-[84%] max-w-sm flex-col bg-ivory p-5 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <span className="font-display text-xl font-semibold text-forest">{t("Menu")}</span>
              <button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-full hover:bg-forest/5" aria-label={t("Close menu")}>
                <svg viewBox="0 0 24 24" className="size-6 text-forest" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <form action={href("/shop")} role="search" aria-label={t("Search the shop")} className="mb-4" onSubmit={close}>
              <label htmlFor="menu-search" className="sr-only">
                {t("Search spices")}
              </label>
              <input id="menu-search" name="q" type="search" placeholder={t("Search spices")} className="field" />
            </form>
            <ul className="space-y-1">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} onClick={close} className="block rounded-xl px-3 py-3 text-base font-semibold text-forest hover:bg-forest/5">
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={href("/account")} onClick={close} className="block rounded-xl px-3 py-3 text-base font-semibold text-forest hover:bg-forest/5">
                  {t("Your account")}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}
