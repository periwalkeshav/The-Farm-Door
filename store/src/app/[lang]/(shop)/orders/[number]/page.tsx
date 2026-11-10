import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { OrderDetailView } from "@/components/shop/order-detail";
import { Container, Skeleton } from "@/components/ui";
import { getCustomer } from "@/data/session";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { checkOrderToken } from "@/server/orders/common";
import { findOrderByNumber, loadOrderDetail } from "@/server/orders/view";
import { canReportProblem, PROBLEM_KIND_LABELS, PROBLEM_STATUS_FOR_CUSTOMER, reportDeadline, reportsForOrder } from "@/server/problems";
import { refillFor } from "@/server/refills";
import { getI18n, localizedMetadata } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({ title: "Your order", path: "/track", robots: { index: false } });
}

export default function OrderPage({ params, searchParams }: PageProps<"/[lang]/orders/[number]">) {
  return (
    <Container className="max-w-5xl py-10">
      <Suspense fallback={<Skeleton className="h-96" />}>
        <OrderContent params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function OrderContent({ params, searchParams }: Pick<PageProps<"/[lang]/orders/[number]">, "params" | "searchParams">) {
  await connection();
  const { t, href } = await getI18n();
  const [{ number }, sp] = await Promise.all([params, searchParams]);
  const token = typeof sp.t === "string" ? sp.t : undefined;
  const db = getDb();
  const order = await findOrderByNumber(db, number);
  const customer = await getCustomer();
  const allowed = order && (checkOrderToken(order, token) || (customer && order.customerId === customer.id));
  if (!order || !allowed) {
    return (
      <div className="card p-10 text-center">
        <h1 className="text-3xl">{t("Order not found")}</h1>
        <p className="mt-2 text-muted">{t("Open the link in your order email, sign in, or track it with your order number.")}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href={href("/track")} className="rounded-full bg-forest px-5 py-2.5 font-semibold text-ivory">
            {t("Track an order")}
          </Link>
          <Link href={`${href("/login")}?next=${encodeURIComponent(href(`/orders/${number}`))}`} className="rounded-full border border-forest px-5 py-2.5 font-semibold text-forest">
            {t("Sign in")}
          </Link>
        </div>
      </div>
    );
  }
  const [detail, refill, reports, original] = await Promise.all([
    loadOrderDetail(db, order, { publicOnly: true }),
    order.status === "DELIVERED" ? refillFor(db, order.id) : null,
    reportsForOrder(db, order.id),
    order.replacementForOrderId ? db.select({ orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, order.replacementForOrderId)) : [],
  ]);
  const problems = {
    reports: reports.map((r) => ({ id: r.id, kindLabel: PROBLEM_KIND_LABELS[r.kind], status: r.status, statusText: PROBLEM_STATUS_FOR_CUSTOMER[r.status], resolutionNote: r.resolutionNote, createdAt: r.createdAt })),
    deadline: reportDeadline(order),
    canReport: canReportProblem(order),
  };
  return (
    <>
      <h1 className="sr-only">{t("Order {number}", { number: order.orderNumber })}</h1>
      <OrderDetailView
        detail={detail}
        mode="owner"
        confirmParam={typeof sp.confirm === "string" ? sp.confirm : undefined}
        justPlaced={sp.placed === "1"}
        unpaid={sp.unpaid === "1"}
        refillDays={refill?.intervalDays ?? null}
        problems={problems}
        replacementFor={original[0]?.orderNumber ?? null}
      />
    </>
  );
}
