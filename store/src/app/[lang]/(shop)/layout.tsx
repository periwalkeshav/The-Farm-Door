import { Suspense } from "react";
import { AnalyticsConsent } from "@/components/shop/analytics-consent";
import { BackToTop, CartToast, FloatingCart } from "@/components/shop/cart-feedback";
import { Footer } from "@/components/shop/footer";
import { Header } from "@/components/shop/header";
import { getCartCount } from "@/data/cart";
import { getPublicSettings } from "@/data/catalog";
import { translator } from "@/i18n/translate";
import { getI18n, getLang } from "@/i18n/server";
import { testModeReasons } from "@/lib/env";

async function TestModeBanner() {
  const { t } = await getI18n();
  const reasons = testModeReasons();
  if (!reasons.length) return null;
  return (
    <div className="bg-chilli px-4 py-1.5 text-center text-xs font-semibold text-white" role="note">
      {t("TEST MODE")}: {reasons.map((r) => t(r)).join(", ")}. {t("No real orders, payments or deliveries.")}
    </div>
  );
}

/** Present only when a Google Analytics ID is set in Admin > Settings. */
async function Analytics() {
  const { analytics } = await getPublicSettings();
  return analytics.gaMeasurementId ? <AnalyticsConsent measurementId={analytics.gaMeasurementId} /> : null;
}

async function FloatingCartSlot() {
  return <FloatingCart count={await getCartCount()} />;
}

export default async function ShopLayout({ children }: LayoutProps<"/[lang]">) {
  const lang = await getLang();
  const t = translator(lang);
  return (
    <>
      {/* First stop for keyboard users: jump past the header (WCAG 2.4.1). */}
      <a href="#main" className="sr-only rounded-full bg-forest px-4 py-2.5 text-sm font-semibold text-ivory focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]">
        {t("Skip to main content")}
      </a>
      <TestModeBanner />
      <Header />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <Footer lang={lang} />
      <Analytics />
      <Suspense fallback={null}>
        <FloatingCartSlot />
      </Suspense>
      {/* Reads the current path, so it streams in after the page (keeps pages pre-renderable). */}
      <Suspense fallback={null}>
        <CartToast />
      </Suspense>
      <BackToTop />
    </>
  );
}
