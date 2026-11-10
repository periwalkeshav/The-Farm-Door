import Link from "next/link";
import { getI18n } from "@/i18n/server";

/** Shown inside the shop's header and footer, which already carry the logo and menu. */
export default async function NotFound() {
  const { t, href } = await getI18n();
  return (
    <div className="grid min-h-[50dvh] place-items-center px-6 py-16 text-center">
      <div>
        <h1 className="text-4xl">{t("We couldn't find that page")}</h1>
        <p className="mt-2 text-muted">{t("It may have moved, or the link may be mistyped.")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={href("/shop")} className="rounded-full bg-forest px-5 py-2.5 font-semibold text-ivory">
            {t("Shop all")}
          </Link>
          <Link href={href("/track")} className="rounded-full border border-forest px-5 py-2.5 font-semibold text-forest">
            {t("Track an order")}
          </Link>
        </div>
      </div>
    </div>
  );
}
