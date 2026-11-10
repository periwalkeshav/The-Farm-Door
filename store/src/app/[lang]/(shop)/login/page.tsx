import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/shop/login-form";
import { Container, Skeleton } from "@/components/ui";
import { getCustomer } from "@/data/session";
import { env } from "@/lib/env";
import { localePath, stripLocale } from "@/i18n/config";
import { getI18n, localizedMetadata } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({ title: "Sign in", path: "/login", robots: { index: false } });
}

export default async function LoginPage({ searchParams }: PageProps<"/[lang]/login">) {
  const { t } = await getI18n();
  return (
    <Container className="max-w-md py-14">
      <h1 className="mb-2 text-4xl">{t("Sign in")}</h1>
      <p className="mb-8 text-muted">{t("See your orders, track deliveries and check out faster.")}</p>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function LoginContent({ searchParams }: { searchParams: PageProps<"/[lang]/login">["searchParams"] }) {
  const sp = await searchParams;
  const { lang, t, href } = await getI18n();
  // Only same-site paths, and in the page's language (an English link from a Hindi page still lands in Hindi).
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") && !sp.next.startsWith("/\\") ? localePath(lang, stripLocale(sp.next)) : href("/account");
  if (await getCustomer()) redirect(next);
  const error = sp.error === "google" ? t("Google sign-in didn't complete. Please try again or use an email code.") : null;
  return (
    <>
      {error && <p className="mb-4 text-sm font-semibold text-chilli">{error}</p>}
      <LoginForm next={next} googleEnabled={!!env().GOOGLE_CLIENT_ID} />
    </>
  );
}
