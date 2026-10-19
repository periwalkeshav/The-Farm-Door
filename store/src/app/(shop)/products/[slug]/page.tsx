import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Gallery } from "@/components/shop/gallery";
import { ProductGrid } from "@/components/shop/product-card";
import { PurchasePanel } from "@/components/shop/purchase-panel";
import { Container, SectionHeading, Skeleton, Stars } from "@/components/ui";
import { getProduct, getPublicSettings, getRelated } from "@/data/catalog";
import { env } from "@/lib/env";
import { mediaUrl } from "@/lib/media-url";

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) return {};
  const image = mediaUrl(product.images[0]?.mediaId, "full");
  return {
    title: product.seoTitle || product.name,
    description: product.seoDescription || product.description.slice(0, 160),
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { title: product.name, description: product.description.slice(0, 200), images: image ? [{ url: image }] : undefined },
  };
}

export default function ProductPage({ params }: PageProps<"/products/[slug]">) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

function ProductSkeleton() {
  return (
    <Container className="grid gap-10 py-10 lg:grid-cols-2">
      <Skeleton className="aspect-square" />
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-40" />
      </div>
    </Container>
  );
}

function Detail({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-line py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between font-display text-lg font-semibold text-forest">
        {title}
        <span className="text-2xl leading-none transition group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="pt-3 text-[15px] leading-relaxed text-ink/90">{children}</div>
    </details>
  );
}

async function ProductContent({ params }: { params: PageProps<"/products/[slug]">["params"] }) {
  const { slug } = await params;
  const [product, settings] = await Promise.all([getProduct(slug), getPublicSettings()]);
  if (!product || !product.variants.length) notFound();
  const related = await getRelated(product.id, product.category?.id ?? null);
  const store = settings.store;
  const prices = product.variants.map((v) => v.pricePaise);
  const anyInStock = product.variants.some((v) => v.sellable > 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images.map((i) => `${env().APP_URL}${mediaUrl(i.mediaId, "full")}`),
    brand: { "@type": "Brand", name: "The Farm Door" },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice: (Math.min(...prices) / 100).toFixed(2),
      highPrice: (Math.max(...prices) / 100).toFixed(2),
      offerCount: product.variants.length,
      availability: anyInStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
    ...(product.rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating.avg, reviewCount: product.rating.count } } : {}),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Container className="py-8">
        <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted">
          <Link href="/shop" className="hover:underline">
            Shop
          </Link>
          {product.category && (
            <>
              {" / "}
              <Link href={`/category/${product.category.slug}`} className="hover:underline">
                {product.category.name}
              </Link>
            </>
          )}
          {" / "}
          <span className="text-forest">{product.name}</span>
        </nav>
        <div className="grid gap-10 lg:grid-cols-2">
          <Gallery images={product.images} name={product.name} />
          <div>
            <h1 className="text-4xl leading-tight sm:text-5xl">{product.name}</h1>
            {product.subtitle && <p className="mt-2 text-lg text-muted">{product.subtitle}</p>}
            {product.rating && (
              <a href="#reviews" className="mt-3 inline-flex items-center gap-2 text-sm hover:underline">
                <Stars rating={product.rating.avg} count={product.rating.count} />
              </a>
            )}
            <div className="mt-6">
              <PurchasePanel
                options={product.options}
                variants={product.variants}
                freeShippingThresholdPaise={settings.shipping.freeShippingThresholdPaise}
                codEnabled={settings.cod.enabled}
              />
            </div>
            <div className="mt-8">
              <Detail title="Description" open>
                <p className="whitespace-pre-line">{product.description}</p>
              </Detail>
              {product.ingredients && (
                <Detail title="Ingredients">
                  <p>{product.ingredients}</p>
                  {product.allergenInfo && <p className="mt-2 font-semibold">{product.allergenInfo}</p>}
                </Detail>
              )}
              {product.usageInstructions && (
                <Detail title="How to use">
                  <p className="whitespace-pre-line">{product.usageInstructions}</p>
                </Detail>
              )}
              <Detail title="Storage & shelf life">
                {product.storageInstructions && <p>{product.storageInstructions}</p>}
                {product.variants[0]?.shelfLife && <p className="mt-2">{product.variants[0].shelfLife}</p>}
              </Detail>
              {product.nutritionInfo && (
                <Detail title="Nutrition information">
                  <p className="whitespace-pre-line">{product.nutritionInfo}</p>
                </Detail>
              )}
              <Detail title="Product information">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted">Net quantity</dt>
                  <dd>{product.variants.map((v) => v.title).join(", ")}</dd>
                  <dt className="text-muted">MRP</dt>
                  <dd>Inclusive of all taxes (shown with each pack size)</dd>
                  <dt className="text-muted">Country of origin</dt>
                  <dd>{product.countryOfOrigin}</dd>
                  <dt className="text-muted">Packed &amp; marketed by</dt>
                  <dd>{store.legalName ? `${store.legalName}, ${[store.addressLine1, store.city, store.state, store.pincode].filter(Boolean).join(", ")}` : "Details to be added by the store"}</dd>
                  {store.fssaiNumber && (
                    <>
                      <dt className="text-muted">FSSAI Lic. No.</dt>
                      <dd>{store.fssaiNumber}</dd>
                    </>
                  )}
                  <dt className="text-muted">Customer care</dt>
                  <dd>{[store.supportEmail, store.supportPhone].filter(Boolean).join(" · ") || "See our contact page"}</dd>
                </dl>
              </Detail>
            </div>
          </div>
        </div>

        <section id="reviews" className="mt-16 scroll-mt-28">
          <SectionHeading title="Customer reviews" />
          {product.reviews.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {product.reviews.map((r) => (
                <article key={r.id} className="card p-5">
                  <Stars rating={r.rating} />
                  {r.title && <p className="mt-2 font-semibold text-forest">{r.title}</p>}
                  <p className="mt-1 text-sm leading-relaxed text-ink/85">{r.body}</p>
                  <p className="mt-3 text-xs text-muted">{r.authorName} · verified buyer</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-muted">No reviews yet. Customers can review a product after it&apos;s delivered, from their account.</p>
          )}
        </section>

        {related.length > 0 && (
          <section className="mt-16">
            <SectionHeading title="You might also like" />
            <ProductGrid products={related} />
          </section>
        )}
      </Container>
    </>
  );
}
