/**
 * Translation by the English wording: t("Add to cart") returns the Hindi when
 * the page is in Hindi and a translation exists, otherwise the English. So
 * the code reads in English, and anything not yet translated still shows (in
 * English) rather than breaking. Messages that come from the server with
 * numbers or names in them are matched by the patterns in hi.ts.
 *
 * {name} in a message is replaced with vars.name.
 */
import type { Locale } from "./config";
import { HI, HI_PATTERNS } from "./hi";

export type Vars = Record<string, string | number>;
export type T = (text: string, vars?: Vars) => string;

function fill(text: string, vars?: Vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

export function translate(lang: Locale, text: string, vars?: Vars): string {
  if (lang === "en" || !text) return fill(text, vars);
  const exact = HI[text];
  if (exact !== undefined) return fill(exact, vars);
  for (const [pattern, replacement] of HI_PATTERNS) {
    const m = text.match(pattern);
    if (m) return fill(typeof replacement === "string" ? text.replace(pattern, replacement) : replacement(...m.slice(1)), vars);
  }
  return fill(text, vars);
}

export const translator =
  (lang: Locale): T =>
  (text, vars) =>
    translate(lang, text, vars);

/** Pack names like "Powder · 250 g": each part translated on its own (sizes stay as they are). */
export function translateParts(lang: Locale, text: string): string {
  if (lang === "en") return text;
  return text
    .split(" · ")
    .map((part) => translate(lang, part))
    .join(" · ");
}
