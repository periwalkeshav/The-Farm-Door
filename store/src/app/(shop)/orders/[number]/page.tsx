import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { OrderDetailView } from "@/components/shop/order-detail";
import { Container, Skeleton } from "@/components/ui";
import { getCustomer } from "@/data/session";
import { getDb } from "@/db";
import { checkOrderToken } from "@/server/orders/common";
import { findOrderByNumber, loadOrderDetail } from "@/server/orders/view";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

export default function OrderPage({ params, searchParams }: PageProps<"/orders/[number]">) {
  return (
    <Container className="max-w-5xl py-10">
      <Suspense fallback={<Skeleton className="h-96" />}>
        <OrderContent params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function OrderContent({ params, searchParams }: Pick<PageProps<"/orders/[number]">, "params" | "searchParams">) {
  await connection();
  const [{ number }, sp] = await Promise.all([params, searchParams]);
  const token = typeof sp.t === "string" ? sp.t : undefined;
  const db = getDb();
  const order = await findOrderByNumber(db, number);
  const customer = await getCustomer();
  const allowed = order && (checkOrderToken(order, token) || (customer && order.customerId === customer.id));
  if (!order || !allowed) {
    return (
      <div className="card p-10 text-center">
        <h1 className="text-3xl">Order not found</h1>
        <p className="mt-2 text-muted">Open the link in your order email, sign in, or track it with your order number.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/track" className="rounded-full bg-forest px-5 py-2.5 font-semibold text-ivory">
            Track an order
          </Link>
          <Link href={`/login?next=/orders/${encodeURIComponent(number)}`} className="rounded-full border border-forest px-5 py-2.5 font-semibold text-forest">
            Sign in
          </Link>
        </div>
      </div>
    );
  }
  const detail = await loadOrderDetail(db, order, { publicOnly: true });
  return (
    <>
      <h1 className="sr-only">Order {order.orderNumber}</h1>
      <OrderDetailView detail={detail} mode="owner" confirmParam={typeof sp.confirm === "string" ? sp.confirm : undefined} justPlaced={sp.placed === "1"} unpaid={sp.unpaid === "1"} />
    </>
  );
}
