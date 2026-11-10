"use client";

/**
 * "हिंदी" / "English": opens the same page in the other language and remembers
 * the choice (a cookie read by src/proxy.ts).
 */
import { LANG_COOKIE, localePath, stripLocale } from "@/i18n/config";
import { useLang } from "@/i18n/client";

export function LanguageSwitch({ className }: { className?: string }) {
  const lang = useLang();
  const other = lang === "hi" ? "en" : "hi";
  return (
    <a
      href={other === "hi" ? "/hi" : "/"}
      hrefLang={other === "hi" ? "hi-IN" : "en-IN"}
      lang={other === "hi" ? "hi-IN" : "en-IN"}
      onClick={(e) => {
        e.preventDefault();
        document.cookie = `${LANG_COOKIE}=${other}; path=/; max-age=31536000; samesite=lax`;
        const { pathname, search, hash } = window.location;
        window.location.href = localePath(other, stripLocale(pathname)) + search + hash;
      }}
      className={className}
    >
      {other === "hi" ? "हिंदी" : "English"}
    </a>
  );
}
