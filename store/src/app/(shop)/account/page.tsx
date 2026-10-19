import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signOutAction } from "@/actions/auth";
import { AddressActions, DeleteAccountButton, ProfileForm, ReviewForm } from "@/components/shop/account-forms";
import { Container, Skeleton, cn } from "@/components/ui";
import { requireCustomer } from "@/data/session";
import { getDb } from "@/db";
import { addresses, customers, orderItems, orders, products, reviews } from "@/db/schema";
import { formatINR } from "@/lib/money";
import { orderAccessToken, STATUS_LABELS } from "@/server/orders/common";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default function AccountPage() {
  return (
    <Container className="py-10">
      <Suspense fallback={<Skeleton className="h-96" />}>
        <AccountContent />
      </Suspense>
    </Container>
  );
}

async function AccountContent() {
  const me = await requireCustomer("/account");
  const db = getDb();
  const [profile] = await db.select().from(customers).where(eq(customers.id, me.id));
  const myOrders = await db
    .select()
    .from(orders)
    .where(and(eq(orders.customerId, me.id), sql`not (${orders.status} = 'CANCELLED' and ${orders.confirmedAt} is null and ${orders.paymentMethod} = 'PREPAID')`))
    .orderBy(desc(orders.placedAt))
    .limit(50);
  const saved = await db.select().from(addresses).where(eq(addresses.customerId, me.id)).orderBy(desc(addresses.isDefault), desc(addresses.createdAt));

  const deliveredIds = myOrders.filter((o) => o.status === "DELIVERED").map((o) => o.id);
  const reviewed = await db
    .select({ productId: reviews.productId, rating: reviews.rating, status: reviews.status, productName: products.name, productSlug: products.slug })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(eq(reviews.customerId, me.id));
  const toReview = deliveredIds.length
    ? await db
        .selectDistinct({ productId: orderItems.productId, name: orderItems.productName })
        .from(orderItems)
        .where(
          and(
            inArray(orderItems.orderId, deliveredIds),
            sql`${orderItems.productId} is not null`,
            reviewed.length ? notInArray(orderItems.productId, reviewed.map((r) => r.productId)) : sql`true`,
          ),
        )
    : [];

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl">Hello{profile.name ? `, ${profile.name.split(" ")[0]}` : ""}</h1>
          <p className="mt-1 text-muted">{profile.email}</p>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest">
            Sign out
          </button>
        </form>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-4 text-2xl">Your orders</h2>
            {myOrders.length === 0 ? (
              <div className="card p-6 text-muted">
                No orders yet.{" "}
                <Link href="/shop" className="font-semibold text-forest underline">
                  Start shopping
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-paper">
                {myOrders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.orderNumber}?t=${orderAccessToken(o)}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-ivory">
                      <span>
                        <span className="font-semibold text-forest">Order {o.orderNumber}</span>
                        <span className="block text-sm text-muted">{o.placedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</span>
                      </span>
                      <span className={cn("rounded-full px-3 py-1 text-xs font-bold", o.status === "CANCELLED" ? "bg-chilli-soft text-chilli" : o.status === "DELIVERED" ? "bg-sage-soft text-forest" : "bg-sand text-forest")}>
                        {STATUS_LABELS[o.status]}
                      </span>
                      <span className="font-semibold">{formatINR(o.totalPaise)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {reviewed.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl">Your reviews</h2>
              <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-paper">
                {reviewed.map((r) => (
                  <li key={r.productId} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                    <Link href={`/products/${r.productSlug}`} className="font-semibold text-forest hover:underline">
                      {r.productName}
                    </Link>
                    <span className="text-saffron">{"★".repeat(r.rating)}</span>
                    <span className={cn("rounded-full px-3 py-1 text-xs font-bold", r.status === "APPROVED" ? "bg-sage-soft text-forest" : r.status === "PENDING" ? "bg-sand text-forest" : "bg-chilli-soft text-chilli")}>
                      {r.status === "APPROVED" ? "Published" : r.status === "PENDING" ? "Waiting for approval" : "Not published"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {toReview.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl">Review your purchases</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {toReview.map((p) => (
                  <div key={p.productId} className="card p-5">
                    <ReviewForm productId={p.productId!} productName={p.name} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 text-xl">Profile</h2>
            <ProfileForm name={profile.name} phone={profile.phone} email={profile.email} marketingOptIn={profile.marketingOptIn} />
          </section>
          <section className="card p-5">
            <h2 className="mb-3 text-xl">Saved addresses</h2>
            {saved.length === 0 ? (
              <p className="text-sm text-muted">Addresses you save at checkout appear here.</p>
            ) : (
              <ul className="space-y-4">
                {saved.map((a) => (
                  <li key={a.id} className="text-sm">
                    <p className="font-semibold">
                      {a.name} {a.isDefault && <span className="ml-1 rounded-full bg-sage-soft px-2 py-0.5 text-xs text-forest">Default</span>}
                    </p>
                    <p className="text-muted">
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.pincode}
                    </p>
                    <p className="mb-1 text-muted">{a.phone}</p>
                    <AddressActions id={a.id} isDefault={a.isDefault} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card p-5">
            <h2 className="mb-3 text-xl">Your data</h2>
            <DeleteAccountButton requested={!!profile.deletionRequestedAt} />
          </section>
        </aside>
      </div>
    </>
  );
}
