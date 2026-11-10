import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { OrderDetailView } from "@/components/shop/order-detail";
import { TrackForm } from "@/components/shop/track-form";
import { Container, Skeleton } from "@/components/ui";
import { getDb } from "@/db";
import { checkOrderToken } from "@/server/orders/common";
import { findOrderByNumber, loadOrderDetail } from "@/server/orders/view";
import { getI18n, localizedMetadata } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({ title: "Track your order", description: "Track your The Farm Door order with your order number and email or mobile number.", path: "/track" });
}

export default async function TrackPage({ searchParams }: PageProps<"/[lang]/track">) {
  const { t } = await getI18n();
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-4xl">{t("Track your order")}</h1>
      <p className="mt-2 mb-8 text-muted">{t("Enter your order number and the email address or mobile number you used at checkout.")}</p>
      <TrackForm />
      <Suspense fallback={<Skeleton className="mt-8 h-64" />}>
        <TrackResult searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function TrackResult({ searchParams }: { searchParams: PageProps<"/[lang]/track">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const number = typeof sp.order === "string" ? sp.order : null;
  const token = typeof sp.k === "string" ? sp.k : null;
  if (!number || !token) return null;
  const db = getDb();
  const order = await findOrderByNumber(db, number);
  if (!order || !checkOrderToken(order, token)) return null;
  const detail = await loadOrderDetail(db, order, { publicOnly: true });
  return (
    <div className="mt-8">
      <OrderDetailView detail={detail} mode="tracking" />
    </div>
  );
}
