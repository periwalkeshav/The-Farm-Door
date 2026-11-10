import type { Metadata } from "next";
import { Suspense } from "react";
import { StopRefillButton } from "@/components/shop/refill-reminder";
import { Container, Skeleton } from "@/components/ui";
import { getI18n, localizedMetadata } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({ title: "Reorder reminders", path: "/refill/stop", robots: { index: false } });
}

export default function StopRefillPage({ searchParams }: PageProps<"/[lang]/refill/stop">) {
  return (
    <Container className="max-w-xl py-14">
      <Suspense fallback={<Skeleton className="h-40" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/[lang]/refill/stop">, "searchParams">) {
  const sp = await searchParams;
  const { t } = await getI18n();
  const id = Number(sp.r);
  const token = typeof sp.t === "string" ? sp.t.slice(0, 64) : "";
  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-3xl">{t("Reorder reminders")}</h1>
      {Number.isInteger(id) && id > 0 && token ? (
        <>
          <p className="mt-3 mb-6 text-muted">{t("Stop the reminder emails for this order? You can set a new one from any delivered order.")}</p>
          <StopRefillButton id={id} token={token} />
        </>
      ) : (
        <p className="mt-3 text-muted">{t("Please open the link from the bottom of a reminder email.")}</p>
      )}
    </div>
  );
}
