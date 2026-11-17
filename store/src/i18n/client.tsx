"use client";

/** Language helpers for Client Components: the page's language comes from the shop layout. */
import { createContext, use, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, localePath, type Locale } from "./config";
import { translator, type T } from "./translate";

const LangContext = createContext<Locale>(DEFAULT_LOCALE);

export function LangProvider({ lang, children }: { lang: Locale; children: ReactNode }) {
  return <LangContext value={lang}>{children}</LangContext>;
}

export function useLang(): Locale {
  return use(LangContext);
}

export function useI18n(): { lang: Locale; t: T; href: (path: string) => string } {
  const lang = useLang();
  return useMemo(() => ({ lang, t: translator(lang), href: (path: string) => localePath(lang, path) }), [lang]);
}
