/** Language helpers for Server Components inside app/[lang] (read from the URL, no prop drilling). */
import type { Metadata } from "next";
import { lang as langParam } from "next/root-params";
import { DEFAULT_LOCALE, isLocale, localePath, type Locale } from "./config";
import { translator, type T } from "./translate";

export async function getLang(): Promise<Locale> {
  const value = await langParam();
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** t() for the current page's language, plus a helper for language-aware links. */
export async function getI18n(): Promise<{ lang: Locale; t: T; href: (path: string) => string }> {
  const lang = await getLang();
  return { lang, t: translator(lang), href: (path) => localePath(lang, path) };
}

/** Language links for a page: its canonical address in this language, and both versions for search engines. */
export function alternates(lang: Locale, path: string) {
  return {
    canonical: localePath(lang, path),
    languages: { "en-IN": path, "hi-IN": localePath("hi", path), "x-default": path },
  };
}

/**
 * Page metadata with the title and description translated, plus language
 * links. Titles are passed in English; anything else (robots, …) is kept.
 */
export async function localizedMetadata({ title, description, path, ...rest }: Omit<Metadata, "title" | "description"> & { title?: string; description?: string; path: string }): Promise<Metadata> {
  const { lang, t } = await getI18n();
  return { ...rest, title: title && t(title), description: description && t(description), alternates: alternates(lang, path) };
}
