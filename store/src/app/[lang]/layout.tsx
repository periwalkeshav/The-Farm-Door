import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RootHtml } from "@/components/root-html";
import { HTML_LANG, isLocale, LOCALES } from "@/i18n/config";
import { LangProvider } from "@/i18n/client";
import { translate } from "@/i18n/translate";

export { viewport } from "@/components/root-html";

export async function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  const l = isLocale(lang) ? lang : "en";
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title: { default: translate(l, "The Farm Door · Indian spices delivered across India"), template: "%s · The Farm Door" },
    description: translate(l, "Indian spices and pantry essentials, delivered to your door across India."),
    openGraph: { siteName: "The Farm Door", type: "website", locale: l === "hi" ? "hi_IN" : "en_IN" },
    twitter: { card: "summary_large_image" },
  };
}

/** Root layout for the shop, in English (/…) and Hindi (/hi/…). */
export default async function ShopRootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <RootHtml lang={HTML_LANG[lang]}>
      <LangProvider lang={lang}>{children}</LangProvider>
    </RootHtml>
  );
}
