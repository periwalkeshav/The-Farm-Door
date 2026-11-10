"use client";

/** Language helpers for Client Components: the page's language comes from the shop layout. */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, localePath, type Locale } from "./config";
import { translator, type T } from "./translate";

const LangContext = createContext<Locale>(DEFAULT_LOCALE);

export function LangProvider({ lang, children }: { lang: Locale; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Locale {
  return useContext(LangContext);
}

export function useI18n(): { lang: Locale; t: T; href: (path: string) => string } {
  const lang = useLang();
  return useMemo(() => ({ lang, t: translator(lang), href: (path: string) => localePath(lang, path) }), [lang]);
}
