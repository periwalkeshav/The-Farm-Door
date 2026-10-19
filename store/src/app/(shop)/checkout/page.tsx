import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckoutForm } from "@/components/shop/checkout-form";
import { Container, Skeleton } from "@/components/ui";
import { getCart } from "@/data/cart";
import { getCustomer } from "@/data/session";
import { getDb } from "@/db";
import { addresses } from "@/db/schema";
import { summarizeCart } from "@/server/checkout";
import { toCheckoutView } from "@/server/checkout-view";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return (
    <Container className="py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <h1 className="text-4xl">Checkout</h1>
        <Link href="/cart" className="text-sm font-semibold text-forest underline">
          Back to cart
        </Link>
      </div>
      <Suspense fallback={<Skeleton className="h-[600px]" />}>
        <CheckoutContent />
      </Suspense>
    </Container>
  );
}

async function CheckoutContent() {
  const [cart, customer] = await Promise.all([getCart(), getCustomer()]);
  if (!cart) return <EmptyCheckout />;
  const db = getDb();
  const saved = customer
    ? await db.select().from(addresses).where(eq(addresses.customerId, customer.id)).orderBy(desc(addresses.isDefault), desc(addresses.createdAt))
    : [];
  const pincode = saved[0]?.pincode ?? cart.pincode;
  const summary = await summarizeCart(db, { cartId: cart.id, couponCode: cart.couponCode, pincode, paymentMethod: "PREPAID", email: customer?.email ?? null });
  if (summary.lines.length === 0) return <EmptyCheckout />;
  return (
    <>
      {!customer && (
        <p className="mb-6 text-sm text-muted">
          Checking out as a guest.{" "}
          <Link href="/login?next=/checkout" className="font-semibold text-forest underline">
            Sign in
          </Link>{" "}
          to use saved addresses and see your orders later.
        </p>
      )}
      <CheckoutForm
        initialView={toCheckoutView(summary)}
        customer={customer ? { email: customer.email, name: customer.name, phone: customer.phone } : null}
        addresses={saved.map((a) => ({ id: a.id, name: a.name, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, pincode: a.pincode }))}
      />
    </>
  );
}

function EmptyCheckout() {
  return (
    <div className="card p-10 text-center">
      <p className="font-display text-2xl text-forest">Your cart is empty</p>
      <Link href="/shop" className="mt-4 inline-block font-semibold text-forest underline">
        Browse spices
      </Link>
    </div>
  );
}
