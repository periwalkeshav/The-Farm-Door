import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { Container } from "@/components/ui";
import { getCategories, getPublicSettings } from "@/data/catalog";
import { CookieSettingsButton } from "./analytics-consent";
import { localePath, type Locale } from "@/i18n/config";
import { translator } from "@/i18n/translate";
import { NewsletterForm } from "./newsletter-form";

export async function Footer({ lang }: { lang: Locale }) {
  "use cache";
  cacheTag("settings", "catalog");
  cacheLife("hours");
  const t = translator(lang);
  const href = (path: string) => localePath(lang, path);
  const [{ store, analytics }, categories] = await Promise.all([getPublicSettings(), getCategories(lang)]);
  const year = new Date().getFullYear();
  const linkClass = "text-ivory/75 hover:text-ivory";
  const socials = (
    [
      ["Instagram", store.instagramUrl],
      ["Facebook", store.facebookUrl],
      ["YouTube", store.youtubeUrl],
    ] as const
  ).filter(([, href]) => href);
  return (
    <footer className="mt-20 bg-forest text-ivory">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="font-display text-2xl font-semibold">The Farm Door</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ivory/75">{t("Indian spices and pantry essentials, shipped from {city} to your door.", { city: t(store.city || "India") })}</p>
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold">{t("Get news and offers")}</p>
            <NewsletterForm tone="dark" />
          </div>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold tracking-wide text-saffron uppercase">{t("Shop")}</p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link className={linkClass} href={href("/shop")}>
                {t("All products")}
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link className={linkClass} href={href(`/category/${c.slug}`)}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold tracking-wide text-saffron uppercase">{t("Help")}</p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link className={linkClass} href={href("/track")}>
                {t("Track your order")}
              </Link>
            </li>
            <li>
              <Link className={linkClass} href={href("/policies/shipping")}>
                {t("Shipping & delivery")}
              </Link>
            </li>
            <li>
              <Link className={linkClass} href={href("/policies/refunds")}>
                {t("Cancellations & refunds")}
              </Link>
            </li>
            <li>
              <Link className={linkClass} href={href("/faq")}>
                {t("FAQ")}
              </Link>
            </li>
            <li>
              <Link className={linkClass} href={href("/bulk-orders")}>
                {t("Bulk & business orders")}
              </Link>
            </li>
            <li>
              <Link className={linkClass} href={href("/contact")}>
                {t("Contact us")}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold tracking-wide text-saffron uppercase">{t("About")}</p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link className={linkClass} href={href("/about")}>
                {t("Our story")}
              </Link>
            </li>
            <li>
              <Link className={linkClass} href={href("/recipes")}>
                {t("Recipes")}
              </Link>
            </li>
            <li>
              <Link className={linkClass} href={href("/policies/privacy")}>
                {t("Privacy policy")}
              </Link>
            </li>
            <li>
              <Link className={linkClass} href={href("/policies/terms")}>
                {t("Terms of service")}
              </Link>
            </li>
            {analytics.gaMeasurementId && (
              <li>
                <CookieSettingsButton className={linkClass} />
              </li>
            )}
          </ul>
          {(store.supportEmail || store.supportPhone) && (
            <div className="mt-5 space-y-1 text-sm text-ivory/75">
              {store.supportEmail && <p>{store.supportEmail}</p>}
              {store.supportPhone && <p>{store.supportPhone}</p>}
              {store.supportHours && <p>{store.supportHours}</p>}
            </div>
          )}
          {socials.length > 0 && (
            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {socials.map(([label, href]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  {label}
                </a>
              ))}
            </p>
          )}
        </div>
      </Container>
      <div className="border-t border-ivory/10">
        <Container className="flex flex-col gap-2 py-5 text-xs text-ivory/60 sm:flex-row sm:justify-between">
          <p>
            © {year} {store.legalName || store.tradeName}. {t("All prices include GST.")}
          </p>
          <p className="flex flex-wrap gap-x-4">
            {store.cin && <span>CIN {store.cin}</span>}
            {store.fssaiNumber && <span>FSSAI Lic. No. {store.fssaiNumber}</span>}
            {store.gstin && <span>GSTIN {store.gstin}</span>}
          </p>
        </Container>
      </div>
    </footer>
  );
}
