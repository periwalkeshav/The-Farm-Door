"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/client";

/**
 * Google Analytics, loaded only after the visitor accepts. The choice is kept in
 * a first-party cookie for 180 days; t("Cookie settings") in the footer reopens it.
 */
const COOKIE = "tfd_consent";
const CHANGED = "tfd:consent";

type Consent = "granted" | "denied" | "unset" | "server";

function readConsent(): Consent {
  const m = document.cookie.match(/(?:^|; )tfd_consent=(granted|denied)/);
  return m ? (m[1] as Consent) : "unset";
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  return () => window.removeEventListener(CHANGED, onChange);
}

function saveConsent(value: "granted" | "denied" | null) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = value ? `${COOKIE}=${value}; Max-Age=${180 * 24 * 3600}; Path=/; SameSite=Lax${secure}` : `${COOKIE}=; Max-Age=0; Path=/`;
  window.dispatchEvent(new Event(CHANGED));
}

/** Removes Google Analytics cookies (set on the site's registrable domain). */
function clearAnalyticsCookies() {
  const parts = location.hostname.split(".");
  const domains = ["", location.hostname, parts.length > 1 ? `.${parts.slice(-2).join(".")}` : ""];
  for (const name of document.cookie.split("; ").map((c) => c.split("=")[0])) {
    if (!name.startsWith("_ga")) continue;
    for (const d of domains) document.cookie = `${name}=; Max-Age=0; Path=/${d ? `; Domain=${d}` : ""}`;
  }
}

export function AnalyticsConsent({ measurementId }: { measurementId: string }) {
  const { t, href } = useI18n();
  const consent = useSyncExternalStore<Consent>(subscribe, readConsent, () => "server");
  // Tidy up cookies Google may have written as the previous page closed.
  useEffect(() => {
    if (consent === "denied") clearAnalyticsCookies();
  }, [consent]);
  if (consent === "server") return null;
  return (
    <>
      {consent === "granted" && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(measurementId)});`}
          </Script>
        </>
      )}
      {consent === "unset" && (
        <div role="dialog" aria-label={t("Cookie choices")} className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border border-line bg-paper p-4 shadow-lg sm:inset-x-6 sm:p-5">
          <p className="text-sm leading-relaxed">
            {t("We'd like to use Google Analytics cookies to understand how visitors use the shop, so we can improve it. Essential cookies for your cart and sign-in are always on.")}{" "}
            <Link href={href("/policies/privacy")} className="font-semibold text-forest underline">
              {t("Privacy policy")}
            </Link>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => saveConsent("granted")} className="rounded-full bg-forest px-5 py-2 text-sm font-semibold text-ivory">
              {t("Accept analytics")}
            </button>
            <button
              type="button"
              onClick={() => {
                const wasGranted = document.cookie.includes("_ga");
                // Tell Google's script to stop sending and writing cookies before it's unloaded.
                (window as unknown as Record<string, boolean>)[`ga-disable-${measurementId}`] = true;
                saveConsent("denied");
                clearAnalyticsCookies();
                if (wasGranted) location.reload(); // unload the analytics script
              }}
              className="rounded-full border border-forest px-5 py-2 text-sm font-semibold text-forest"
            >
              {t("Decline")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function CookieSettingsButton({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={() => saveConsent(null)} className={className}>
      {t("Cookie settings")}
    </button>
  );
}
