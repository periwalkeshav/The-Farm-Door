import Link from "next/link";
import { Suspense } from "react";
import { Container, Logo } from "@/components/ui";
import { getCartCount } from "@/data/cart";
import { getCategories, getFeaturedCoupon, getPublicSettings, getRunningSale } from "@/data/catalog";
import { getCustomer } from "@/data/session";
import { dateLocale, localePath, type Locale } from "@/i18n/config";
import { getI18n } from "@/i18n/server";
import { translator } from "@/i18n/translate";
import { formatINR } from "@/lib/money";
import { CopyCode } from "./copy-code";
import { CategoryMenu } from "./category-menu";
import { LanguageSwitch } from "./language-switch";
import { MobileMenu } from "./mobile-menu";
import { MotionToggle } from "./motion";
import { DeliverTo } from "./pincode";
import { SearchBox } from "./search-box";

/** Scrolling ticker of store promises (and any running sale). Pauses on hover, focus or the pause button. */
async function AnnouncementBar({ lang }: { lang: Locale }) {
  "use cache";
  const t = translator(lang);
  const [{ shipping, cod }, sale, coupon] = await Promise.all([getPublicSettings(), getRunningSale(), getFeaturedCoupon()]);
  const parts = [
    sale
      ? t("{name}: {percent}% off {what}, ends {date}", {
          name: sale.name,
          percent: sale.percent,
          what: t(sale.scope === "ALL" ? "everything" : "selected spices"),
          date: sale.endsAt.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }),
        })
      : null,
    shipping.freeShippingThresholdPaise !== null ? t("Free shipping on orders over {amount}", { amount: formatINR(shipping.freeShippingThresholdPaise) }) : null,
    t("Delivering across India"),
    cod.enabled ? t("Cash on delivery available") : null,
    t("Delivery dates for your pincode before you pay"),
    t("Search in Hindi too: haldi, jeera, elaichi"),
  ].filter((p): p is string => !!p);
  // The copy of the list (for the seamless loop) is hidden from screen readers and can't be tabbed into.
  const list = (copy: boolean) => (
    <ul className={`flex shrink-0 items-center gap-10 pr-10 ${copy ? "ticker-copy" : ""}`} aria-hidden={copy || undefined} inert={copy || undefined}>
      {coupon && (
        <li className="flex items-center gap-10 whitespace-nowrap">
          <span aria-hidden="true" className="text-saffron">
            ✦
          </span>
          <span className="flex items-center gap-2">
            {t("Use code")} <CopyCode code={coupon.code} />
            {coupon.label}
          </span>
        </li>
      )}
      {parts.map((p) => (
        <li key={p} className="flex items-center gap-10 whitespace-nowrap">
          <span aria-hidden="true" className="text-saffron">
            ✦
          </span>
          {p}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="flex items-center bg-forest text-xs font-semibold tracking-wide text-ivory">
      <div className="ticker min-w-0 flex-1 overflow-hidden py-2" role="region" aria-label={t("Store news")}>
        <div className="ticker-track flex w-max" style={{ "--ticker-duration": `${(parts.length + (coupon ? 2 : 0)) * 7}s` } as React.CSSProperties}>
          {list(false)}
          {list(true)}
        </div>
      </div>
      <MotionToggle className="mr-2 grid size-7 shrink-0 place-items-center rounded-full text-ivory/80 hover:bg-ivory/10 hover:text-ivory" />
    </div>
  );
}

async function CartLink({ lang }: { lang: Locale }) {
  const t = translator(lang);
  const count = await getCartCount();
  return (
    <Link href={localePath(lang, "/cart")} className="relative grid size-10 place-items-center rounded-full text-forest hover:bg-forest/5" aria-label={t(count === 1 ? "Cart, {count} item" : "Cart, {count} items", { count })}>
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </svg>
      {count > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-saffron px-1 text-[11px] font-bold text-forest-deep">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}

async function AccountLink({ lang }: { lang: Locale }) {
  const t = translator(lang);
  const customer = await getCustomer();
  return (
    <Link href={localePath(lang, customer ? "/account" : "/login")} className="grid size-10 place-items-center rounded-full text-forest hover:bg-forest/5" aria-label={t(customer ? "Your account" : "Sign in")}>
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5" />
      </svg>
    </Link>
  );
}

const IconPlaceholder = () => <span className="size-10" />;

const SEARCH_HINTS = ["haldi", "jeera", "toor dal", "mustard oil", "garam masala", "basmati", "elaichi"];
const SEARCH_HINTS_HI = ["हल्दी", "जीरा", "तूर दाल", "सरसों का तेल", "गरम मसाला", "बासमती", "इलायची"];

export async function Header() {
  const { lang, t, href } = await getI18n();
  const categories = await getCategories(lang);
  const categoryLinks = categories.map((c) => ({ href: href(`/category/${c.slug}`), label: c.name }));
  // The phone menu lists everything; the desktop header puts the categories in one dropdown so it always fits.
  const links = [{ href: href("/shop"), label: t("Shop all") }, ...categoryLinks, { href: href("/track"), label: t("Track order") }];
  const deliverTo = {
    deliverTo: t("Deliver to"),
    enterPincode: t("Enter your pincode"),
    title: t("Your delivery pincode"),
    hint: t("We'll show delivery dates and shipping for this pincode."),
    save: t("Save"),
    invalid: t("Enter a 6-digit pincode, like 302001."),
    saved: t("Saved"),
  };
  return (
    <header className="sticky top-0 z-40">
      <AnnouncementBar lang={lang} />
      <div className="border-b border-line bg-ivory/90 backdrop-blur supports-[backdrop-filter]:bg-ivory/75">
        <Container className="flex h-16 items-center gap-2 sm:gap-3">
          <MobileMenu links={links} />
          <Link href={href("/")} aria-label={t("The Farm Door home")} className="shrink-0">
            <Logo />
          </Link>
          <nav aria-label={t("Main")} className="ml-6 hidden items-center gap-1 xl:flex">
            <Link href={href("/shop")} className="rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap text-forest/85 hover:bg-forest/5 hover:text-forest">
              {t("Shop all")}
            </Link>
            {categoryLinks.length > 0 && <CategoryMenu label={t("Categories")} items={categoryLinks} />}
            <Link href={href("/track")} className="rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap text-forest/85 hover:bg-forest/5 hover:text-forest">
              {t("Track order")}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <DeliverTo labels={deliverTo} className="mr-3 hidden lg:block" />
            <form action={href("/shop")} role="search" aria-label={t("Search the shop")} className="mr-1 hidden md:block">
              <SearchBox label={t("Search spices")} placeholder={t("Search spices")} hints={lang === "hi" ? SEARCH_HINTS_HI : SEARCH_HINTS} inputClassName="w-44 rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-forest focus:ring-4 focus:ring-saffron/25 lg:w-52" />
            </form>
            <Link href={`${href("/shop")}?focus=search`} className="grid size-10 place-items-center rounded-full text-forest hover:bg-forest/5 md:hidden" aria-label={t("Search")}>
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m20 20-4.2-4.2" />
              </svg>
            </Link>
            {/* On phones the top row is full, so the switch sits in the "Deliver to" row below instead. */}
            <LanguageSwitch className="hidden h-10 place-items-center rounded-full px-2.5 text-sm font-semibold text-forest hover:bg-forest/5 sm:grid" />
            <Suspense fallback={<IconPlaceholder />}>
              <AccountLink lang={lang} />
            </Suspense>
            <Suspense fallback={<IconPlaceholder />}>
              <CartLink lang={lang} />
            </Suspense>
          </div>
        </Container>
        <Container className="flex items-center justify-between gap-3 border-t border-line/70 py-1.5 lg:hidden">
          <DeliverTo labels={deliverTo} />
          <LanguageSwitch className="grid h-10 shrink-0 place-items-center rounded-full border border-line px-3 text-sm font-semibold text-forest hover:bg-forest/5 sm:hidden" />
        </Container>
      </div>
    </header>
  );
}
