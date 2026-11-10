import type { Metadata } from "next";
import { Suspense } from "react";
import { UnsubscribeForm } from "@/components/shop/unsubscribe-form";
import { Container, Skeleton } from "@/components/ui";
import { getI18n, localizedMetadata } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({ title: "Email preferences", path: "/unsubscribe", robots: { index: false } });
}

export default function UnsubscribePage({ searchParams }: PageProps<"/[lang]/unsubscribe">) {
  return (
    <Container className="max-w-xl py-14">
      <Suspense fallback={<Skeleton className="h-48" />}>
        <UnsubscribeContent searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function UnsubscribeContent({ searchParams }: Pick<PageProps<"/[lang]/unsubscribe">, "searchParams">) {
  const sp = await searchParams;
  const { t } = await getI18n();
  const email = typeof sp.e === "string" ? sp.e.slice(0, 200) : "";
  const token = typeof sp.t === "string" ? sp.t.slice(0, 64) : "";
  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-3xl">{t("Email preferences")}</h1>
      {email && token ? (
        <>
          <p className="mt-3 text-muted">
            {t("Stop reminder and offer emails to")} <strong className="text-ink">{email}</strong>? {t("You'll still get emails about orders you place, such as confirmations and delivery updates.")}
          </p>
          <div className="mt-6">
            <UnsubscribeForm email={email} token={token} />
          </div>
        </>
      ) : (
        <p className="mt-3 text-muted">{t("Please open the link from the bottom of one of our emails.")}</p>
      )}
    </div>
  );
}
