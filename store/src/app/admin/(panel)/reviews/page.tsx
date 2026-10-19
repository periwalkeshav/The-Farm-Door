import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { ReviewButtons } from "@/components/admin/marketing-forms";
import { PageHeader } from "@/components/admin/ui";
import { Stars } from "@/components/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { orders, products, reviews } from "@/db/schema";

export const metadata = { title: "Reviews" };

export default function ReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading reviews…</p>}>
      <Reviews searchParams={searchParams} />
    </Suspense>
  );
}

async function Reviews({ searchParams }: { searchParams: PageProps<"/admin/reviews">["searchParams"] }) {
  await requireStaff("reviews.manage");
  const sp = await searchParams;
  const status = sp.status === "APPROVED" || sp.status === "REJECTED" ? sp.status : "PENDING";
  const rows = await getDb()
    .select({ r: reviews, product: products.name, productSlug: products.slug, orderNumber: orders.orderNumber, orderId: orders.id })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .leftJoin(orders, eq(orders.id, reviews.orderId))
    .where(eq(reviews.status, status))
    .orderBy(desc(reviews.createdAt))
    .limit(200);
  return (
    <>
      <PageHeader title="Reviews" description="Only customers whose order was delivered can review a product. Nothing appears in the shop until you approve it. Don't edit or selectively hide genuine negative reviews; reject only spam, abuse or off-topic posts." />
      <div className="mb-4 flex gap-2">
        {(["PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
          <Link key={s} href={`/admin/reviews?status=${s}`} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${status === s ? "border-forest bg-forest text-ivory" : "border-line bg-paper text-forest"}`}>
            {s === "PENDING" ? "Waiting" : s === "APPROVED" ? "Published" : "Rejected"}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-line bg-paper p-6 text-sm text-muted">No reviews here.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ r, product, productSlug, orderNumber, orderId }) => (
            <li key={r.id} className="rounded-2xl border border-line bg-paper p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Stars rating={r.rating} />
                  <p className="mt-1 font-semibold text-forest">{r.title || "(no headline)"}</p>
                  <p className="mt-1 max-w-3xl text-sm whitespace-pre-line">{r.body}</p>
                  <p className="mt-2 text-xs text-muted">
                    {r.authorName} on{" "}
                    <a href={`/products/${productSlug}`} target="_blank" className="underline">
                      {product}
                    </a>
                    {orderNumber && (
                      <>
                        {" · order "}
                        <Link href={`/admin/orders/${orderId}`} className="underline">
                          {orderNumber}
                        </Link>
                      </>
                    )}
                    {" · "}
                    {r.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <ReviewButtons reviewId={r.id} status={r.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
