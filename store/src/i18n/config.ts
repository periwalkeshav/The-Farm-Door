/**
 * Languages the shop is shown in. English pages keep their plain addresses
 * (/shop); Hindi pages live under /hi (/hi/shop). Internally every shop page
 * sits under app/[lang]; src/proxy.ts maps plain addresses to "en".
 */
export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Cookie remembering a visitor's language choice. */
export const LANG_COOKIE = "tfd-lang";

export const HTML_LANG: Record<Locale, string> = { en: "en-IN", hi: "hi-IN" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** The address of a shop page in a language: localePath("hi", "/shop") is "/hi/shop". */
export function localePath(lang: Locale, path: string): string {
  if (lang === "en") return path;
  if (path === "/") return "/hi";
  return path.startsWith("/") ? `/hi${path}` : path;
}

/** The plain (English) form of an address, dropping any language prefix. */
export function stripLocale(path: string): string {
  const m = path.match(/^\/(en|hi)(?=\/|$)/);
  if (!m) return path;
  return path.slice(m[0].length) || "/";
}

/** Locale for dates: Hindi month names on Hindi pages. */
export function dateLocale(lang: Locale) {
  return lang === "hi" ? "hi-IN" : "en-IN";
}
