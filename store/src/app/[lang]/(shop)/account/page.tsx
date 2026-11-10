import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signOutAction } from "@/actions/auth";
import { AddressActions, DeleteAccountButton, ProfileForm, ReviewForm } from "@/components/shop/account-forms";
import { BuyAgainButton } from "@/components/shop/order-actions";
import { RemoveSavedButton } from "@/components/shop/wishlist-button";
import { mediaUrl } from "@/lib/media-url";
import { savedProducts } from "@/server/wishlist";
import { CopyButton } from "@/components/copy-button";
import { POINT_REASONS, pointsBalance, pointsHistory, referralCodeFor } from "@/server/loyalty";
import { readSettings } from "@/server/settings";
import { Container, Skeleton, cn } from "@/components/ui";
import { requireCustomer } from "@/data/session";
import { getDb } from "@/db";
import { addresses, customers, orderItems, orders, products, reviews } from "@/db/schema";
import { formatINR } from "@/lib/money";
import { orderAccessToken, STATUS_LABELS } from "@/server/orders/common";
import { dateLocale } from "@/i18n/config";
import { getI18n, localizedMetadata } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({ title: "Your account", path: "/account", robots: { index: false } });
}

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
  const { lang, t, href } = await getI18n();
  const me = await requireCustomer(href("/account"));
  const db = getDb();
  const [profile] = await db.select().from(customers).where(eq(customers.id, me.id));
  const myOrders = await db
    .select()
    .from(orders)
    .where(and(eq(orders.customerId, me.id), sql`not (${orders.status} = 'CANCELLED' and ${orders.confirmedAt} is null and ${orders.paymentMethod} = 'PREPAID')`))
    .orderBy(desc(orders.placedAt))
    .limit(50);
  const saved = await db.select().from(addresses).where(eq(addresses.customerId, me.id)).orderBy(desc(addresses.isDefault), desc(addresses.createdAt));

  const saved_ = await savedProducts(db, me.id);
  const loyalty = await readSettings(db, "loyalty");
  const [balance, history, referralCode] = await Promise.all([
    loyalty.pointsEnabled ? pointsBalance(db, me.id) : 0,
    loyalty.pointsEnabled ? pointsHistory(db, me.id, 6) : [],
    loyalty.referralsEnabled ? referralCodeFor(db, { id: me.id, name: profile.name, email: profile.email }) : null,
  ]);
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
          <h1 className="text-4xl">{profile.name ? t("Hello, {name}", { name: profile.name.split(" ")[0] }) : t("Hello")}</h1>
          <p className="mt-1 text-muted">{profile.email}</p>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest">
            {t("Sign out")}
          </button>
        </form>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-4 text-2xl">{t("Your orders")}</h2>
            {myOrders.length === 0 ? (
              <div className="card p-6 text-muted">
                {t("No orders yet.")}{" "}
                <Link href={href("/shop")} className="font-semibold text-forest underline">
                  {t("Start shopping")}
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-paper">
                {myOrders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-x-3 pr-4 hover:bg-ivory">
                    <Link href={href(`/orders/${o.orderNumber}?t=${orderAccessToken(o)}`)} className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 p-4">
                      <span>
                        <span className="font-semibold text-forest">{t("Order {number}", { number: o.orderNumber })}</span>
                        <span className="block text-sm text-muted">{o.placedAt.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</span>
                      </span>
                      <span className={cn("rounded-full px-3 py-1 text-xs font-bold", o.status === "CANCELLED" ? "bg-chilli-soft text-chilli" : o.status === "DELIVERED" ? "bg-sage-soft text-forest" : "bg-sand text-forest")}>
                        {t(STATUS_LABELS[o.status])}
                      </span>
                      <span className="font-semibold">{formatINR(o.totalPaise)}</span>
                    </Link>
                    {o.status === "DELIVERED" && (
                      <div className="pb-4 pl-4 sm:p-0">
                        <BuyAgainButton orderNumber={o.orderNumber} token={orderAccessToken(o)} compact />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {saved_.length > 0 && (
            <section id="saved" className="scroll-mt-28">
              <h2 className="mb-4 text-2xl">{t("Saved for later")}</h2>
              <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-paper">
                {saved_.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-4 p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.image ? <img src={mediaUrl(p.image, "small")!} alt="" width={56} height={56} loading="lazy" className="size-14 rounded-lg object-cover" /> : <span className="size-14 rounded-lg bg-sand" />}
                    <div className="min-w-0 flex-1">
                      {p.status === "ACTIVE" ? (
                        <Link href={href(`/products/${p.slug}`)} className="font-semibold text-forest hover:underline">
                          {p.name}
                        </Link>
                      ) : (
                        <span className="font-semibold text-muted">{p.name}</span>
                      )}
                      <p className="text-sm text-muted">
                        {p.status !== "ACTIVE" ? t("No longer sold") : !p.inStock ? t("Sold out for now") : p.minPrice !== null ? t("From {price}", { price: formatINR(p.minPrice) }) : ""}
                      </p>
                    </div>
                    <RemoveSavedButton productId={p.id} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {reviewed.length > 0 && (
            <section>
              <h2 className="mb-4 text-2xl">{t("Your reviews")}</h2>
              <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-paper">
                {reviewed.map((r) => (
                  <li key={r.productId} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                    <Link href={href(`/products/${r.productSlug}`)} className="font-semibold text-forest hover:underline">
                      {r.productName}
                    </Link>
                    <span className="text-saffron-deep" role="img" aria-label={t("{rating} out of 5 stars", { rating: r.rating })}>{"★".repeat(r.rating)}</span>
                    <span className={cn("rounded-full px-3 py-1 text-xs font-bold", r.status === "APPROVED" ? "bg-sage-soft text-forest" : r.status === "PENDING" ? "bg-sand text-forest" : "bg-chilli-soft text-chilli")}>
                      {t(r.status === "APPROVED" ? "Published" : r.status === "PENDING" ? "Waiting for approval" : "Not published")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {toReview.length > 0 && (
            <section id="reviews" className="scroll-mt-28">
              <h2 className="mb-4 text-2xl">{t("Review your purchases")}</h2>
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
          {loyalty.pointsEnabled && (
            <section className="card p-5">
              <h2 className="mb-1 text-xl">{t("Your points")}</h2>
              <p className="font-display text-3xl font-semibold text-forest">{balance}</p>
              <p className="text-sm text-muted">
                {t("Worth {amount} at checkout. You earn {points} points per ₹100 when an order is delivered.", { amount: formatINR(balance * loyalty.pointValuePaise), points: loyalty.pointsPerHundredRupees })}
              </p>
              {history.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs">
                  {history.map((h) => (
                    <li key={h.id} className="flex justify-between gap-3">
                      <span className="text-muted">
                        {t(POINT_REASONS[h.reason])}
                        {h.orderNumber ? ` #${h.orderNumber}` : ""}
                      </span>
                      <span className={h.points > 0 ? "font-semibold text-forest" : "font-semibold text-chilli"}>{h.points > 0 ? `+${h.points}` : h.points}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {referralCode && (
            <section className="card p-5">
              <h2 className="mb-1 text-xl">{t("Refer a friend")}</h2>
              <p className="text-sm text-muted">
                {t("Friends get {percent}% off their first order (up to {max}) with your code.", { percent: loyalty.referralDiscountPercent, max: formatINR(loyalty.referralMaxDiscountPaise) })}
                {loyalty.pointsEnabled && loyalty.referralRewardPoints > 0 ? ` ${t("You get {points} points when it's delivered.", { points: loyalty.referralRewardPoints })}` : ""}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <code className="rounded-lg bg-sand px-3 py-1.5 font-mono text-lg font-bold tracking-wide text-forest">{referralCode}</code>
                <CopyButton text={referralCode} label={t("Copy code")} />
              </div>
            </section>
          )}
          <section className="card p-5">
            <h2 className="mb-4 text-xl">{t("Profile")}</h2>
            <ProfileForm name={profile.name} phone={profile.phone} email={profile.email} marketingOptIn={profile.marketingOptIn} />
          </section>
          <section className="card p-5">
            <h2 className="mb-3 text-xl">{t("Saved addresses")}</h2>
            {saved.length === 0 ? (
              <p className="text-sm text-muted">{t("Addresses you save at checkout appear here.")}</p>
            ) : (
              <ul className="space-y-4">
                {saved.map((a) => (
                  <li key={a.id} className="text-sm">
                    <p className="font-semibold">
                      {a.name} {a.isDefault && <span className="ml-1 rounded-full bg-sage-soft px-2 py-0.5 text-xs text-forest">{t("Default")}</span>}
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
            <h2 className="mb-3 text-xl">{t("Your data")}</h2>
            <p className="mb-3 text-sm text-muted">{t("Get a copy of everything we hold about you: your details, addresses, orders, reviews and email preferences.")}</p>
            <a href={href("/account/data-export")} download className="mb-5 inline-block rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest hover:bg-forest/5">
              {t("Download my data")}
            </a>
            <DeleteAccountButton requested={!!profile.deletionRequestedAt} />
          </section>
        </aside>
      </div>
    </>
  );
}
