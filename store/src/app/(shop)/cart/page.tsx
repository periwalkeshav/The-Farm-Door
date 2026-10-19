import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CartPincode, CouponForm, QuantityControl } from "@/components/shop/cart-controls";
import { Totals } from "@/components/shop/order-summary";
import { Container, LinkButton, Notice, Skeleton } from "@/components/ui";
import { getCart } from "@/data/cart";
import { getCustomer } from "@/data/session";
import { getDb } from "@/db";
import { formatINR } from "@/lib/money";
import { summarizeCart } from "@/server/checkout";
import { toCheckoutView } from "@/server/checkout-view";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default function CartPage() {
  return (
    <Container className="py-10">
      <h1 className="mb-8 text-4xl">Your cart</h1>
      <Suspense fallback={<Skeleton className="h-80" />}>
        <CartContent />
      </Suspense>
    </Container>
  );
}

async function CartContent() {
  const [cart, customer] = await Promise.all([getCart(), getCustomer()]);
  const view = cart
    ? toCheckoutView(await summarizeCart(getDb(), { cartId: cart.id, couponCode: cart.couponCode, pincode: cart.pincode, paymentMethod: "PREPAID", email: customer?.email ?? null }))
    : null;

  if (!view || view.lines.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="font-display text-2xl text-forest">Your cart is empty</p>
        <p className="mt-2 text-muted">Find something good for your kitchen.</p>
        <LinkButton href="/shop" className="mt-6">
          Browse spices
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <section aria-label="Items">
        {view.hasIssues && (
          <Notice tone="warn" className="mb-4">
            Some items need attention before you can check out.
          </Notice>
        )}
        <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-paper">
          {view.lines.map((l) => (
            <li key={l.variantId} className="flex gap-4 p-4">
              <Link href={`/products/${l.productSlug}`} className="size-24 shrink-0 overflow-hidden rounded-xl bg-sand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {l.image && <img src={l.image} alt="" className="size-full object-cover" loading="lazy" />}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex justify-between gap-3">
                  <div>
                    <Link href={`/products/${l.productSlug}`} className="font-display text-lg font-semibold text-forest hover:underline">
                      {l.productName}
                    </Link>
                    <p className="text-sm text-muted">{l.variantTitle}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatINR(l.lineTotalPaise)}</p>
                    {l.quantity > 1 && <p className="text-xs text-muted">{formatINR(l.unitPricePaise)} each</p>}
                  </div>
                </div>
                <QuantityControl variantId={l.variantId} quantity={l.quantity} max={Math.max(l.sellable, l.quantity)} />
                {l.issue && <p className="text-sm font-semibold text-chilli">{l.issue}</p>}
              </div>
            </li>
          ))}
        </ul>
        <Link href="/shop" className="mt-4 inline-block text-sm font-semibold text-forest underline">
          ← Continue shopping
        </Link>
      </section>

      <aside className="card h-fit space-y-5 p-5 lg:sticky lg:top-32">
        <CartPincode pincode={view.pincode} />
        <CouponForm code={view.couponCode} ok={view.couponOk} message={view.couponMessage} />
        <Totals view={view} />
        {view.hasIssues ? (
          <p className="text-center text-sm font-semibold text-chilli">Fix the items above to continue.</p>
        ) : (
          <LinkButton href="/checkout" size="lg" className="w-full">
            Proceed to checkout
          </LinkButton>
        )}
        <p className="text-center text-xs text-muted">Shipping is calculated from live courier rates for your pincode.</p>
      </aside>
    </div>
  );
}
