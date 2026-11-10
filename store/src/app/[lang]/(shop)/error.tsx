"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/components/error-reporter";
import { useI18n } from "@/i18n/client";

export default function ShopError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t, href } = useI18n();
  useEffect(() => {
    console.error(error);
    reportClientError(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <h1 className="text-3xl">{t("Something went wrong")}</h1>
      <p className="mt-2 text-muted">{t("Please try again. If you were paying, don't worry: payments are only confirmed after we verify them, and any money taken for an unconfirmed order is refunded automatically.")}</p>
      {error.digest && <p className="mt-2 text-xs text-muted">{t("Reference: {code}", { code: error.digest })}</p>}
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-full bg-forest px-5 py-2.5 font-semibold text-ivory">
          {t("Try again")}
        </button>
        <Link href={href("/")} className="rounded-full border border-forest px-5 py-2.5 font-semibold text-forest">
          {t("Home")}
        </Link>
      </div>
    </div>
  );
}
