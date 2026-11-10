import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { BundleBuilder, type BundleItem } from "@/components/shop/bundle-builder";
import { Gallery } from "@/components/shop/gallery";
import { ShareButton } from "@/components/shop/share-button";
import { ProductGrid } from "@/components/shop/product-card";
import { PurchasePanel } from "@/components/shop/purchase-panel";
import { WishlistButton } from "@/components/shop/wishlist-button";
import { getCustomer } from "@/data/session";
import { getDb } from "@/db";
import { isSaved } from "@/server/wishlist";
import { Container, SectionHeading, Skeleton, Stars } from "@/components/ui";
import { getBoughtTogether, getBoxContents, getProduct, getPublicSettings, getRelated } from "@/data/catalog";
import { getRecipesForProduct } from "@/data/recipes";
import { RecipeCard } from "@/components/shop/recipe-card";
import { env } from "@/lib/env";
import { mediaUrl } from "@/lib/media-url";
import { formatINR } from "@/lib/money";
import { isPlaceholder } from "@/server/settings";
import { dateLocale } from "@/i18n/config";
import { alternates, getI18n } from "@/i18n/server";
import { translateParts } from "@/i18n/translate";

export async function generateMetadata({ params }: PageProps<"/[lang]/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { lang } = await getI18n();
  const product = await getProduct(slug, lang);
  if (!product) return {};
  const image = mediaUrl(product.images[0]?.mediaId, "full");
  // The SEO title and description are written in English; Hindi pages use the Hindi name and description.
  const english = lang === "en";
  return {
    title: (english && product.seoTitle) || product.name,
    description: (english && product.seoDescription) || product.description.slice(0, 160),
    alternates: alternates(lang, `/products/${product.slug}`),
    openGraph: { title: product.name, description: product.description.slice(0, 200), images: image ? [{ url: image }] : undefined },
  };
}

export default function ProductPage({ params }: PageProps<"/[lang]/products/[slug]">) {
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

/** Per-visitor part of the page: whether this product is in their saved list. */
async function WishlistSlot({ productId, slug }: { productId: number; slug: string }) {
  const customer = await getCustomer();
  const saved = customer ? await isSaved(getDb(), customer.id, productId) : false;
  return <WishlistButton productId={productId} slug={slug} signedIn={!!customer} initialSaved={saved} icon />;
}

const TRUST_ICONS = {
  truck: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  cash: "M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 10v4M18 10v4",
  lock: "M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5zM12 15v2",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  shield: "M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6zM9 12l2 2 4-4",
  leaf: "M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l7-7",
};

/** Small facts that answer "can I trust this shop?": all taken from your settings and policies. */
async function TrustStrip({ settings }: { settings: Awaited<ReturnType<typeof getPublicSettings>> }) {
  const { t, href } = await getI18n();
  const { shipping, cod, store } = settings;
  const items: { icon: keyof typeof TRUST_ICONS; title: string; text: string; href?: string }[] = [
    shipping.freeShippingThresholdPaise !== null
      ? { icon: "truck", title: t("Free delivery over {amount}", { amount: formatINR(shipping.freeShippingThresholdPaise) }), text: t("Live courier rates below that") }
      : { icon: "truck", title: t("Delivery across India"), text: t("Courier rate and date for your pincode") },
    ...(cod.enabled ? [{ icon: "cash" as const, title: t("Cash on delivery"), text: t("Pay at your door") }] : []),
    { icon: "lock", title: t("Secure payment"), text: t("UPI, cards, net banking") },
    { icon: "receipt", title: t("GST invoice"), text: t("With every order") },
    { icon: "shield", title: t("Damaged or wrong?"), text: t("Tell us within 48 hours"), href: href("/policies/refunds") },
    ...(store.fssaiNumber && !isPlaceholder(store.fssaiNumber) ? [{ icon: "leaf" as const, title: t("FSSAI licensed"), text: t("Lic. No. {number}", { number: store.fssaiNumber }) }] : []),
  ];
  return (
    <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((it) => {
        const body = (
          <>
            <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-forest" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={TRUST_ICONS[it.icon]} />
            </svg>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-forest">{it.title}</span>
              <span className="block text-xs text-muted">{it.text}</span>
            </span>
          </>
        );
        return (
          <li key={it.title}>
            {it.href ? (
              <Link href={it.href} className="flex h-full gap-2 rounded-xl bg-sand/60 p-2.5 hover:bg-sand">
                {body}
              </Link>
            ) : (
              <div className="flex h-full gap-2 rounded-xl bg-sand/60 p-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
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

async function ProductContent({ params }: { params: PageProps<"/[lang]/products/[slug]">["params"] }) {
  const { slug } = await params;
  const { lang, t, href } = await getI18n();
  const [product, settings] = await Promise.all([getProduct(slug, lang), getPublicSettings()]);
  if (!product || !product.variants.length) notFound();
  const [together, relatedAll, contents, recipes] = await Promise.all([
    getBoughtTogether(product.id, lang),
    getRelated(product.id, product.category?.id ?? null, lang),
    getBoxContents(product.id),
    getRecipesForProduct(product.id, lang),
  ]);
  const boxes = product.variants.filter((v) => contents[v.id]?.length);
  // The bundle is real "bought together" data once there is some; until then, other spices from the same shelf.
  const partners = (together.length ? together : relatedAll).filter((c) => c.inStock).slice(0, 3);
  const related = relatedAll.filter((r) => !together.some((x) => x.id === r.id) && !(together.length === 0 && partners.some((p) => p.id === r.id)));
  const main = product.variants.find((v) => v.sellable > 0);
  const bundle: BundleItem[] = main
    ? [
        { variantId: main.id, slug: product.slug, name: product.name, packLabel: main.title, pricePaise: main.pricePaise, mrpPaise: main.mrpPaise, imageId: product.images[0]?.mediaId ?? null, current: true },
        ...partners.map((c) => {
          const pack = c.packs[c.defaultPack];
          return { variantId: pack.variantId, slug: c.slug, name: c.name, packLabel: pack.label, pricePaise: pack.pricePaise, mrpPaise: pack.mrpPaise, imageId: c.imageId };
        }),
      ]
    : [];
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
        <nav aria-label={t("Breadcrumb")} className="mb-5 text-sm text-muted">
          <Link href={href("/shop")} className="hover:underline">
            {t("Shop")}
          </Link>
          {product.category && (
            <>
              {" / "}
              <Link href={href(`/category/${product.category.slug}`)} className="hover:underline">
                {product.category.name}
              </Link>
            </>
          )}
          {" / "}
          <span className="text-forest">{product.name}</span>
        </nav>
        <div className="grid gap-10 lg:grid-cols-2">
          <Gallery
            images={product.images}
            name={product.name}
            actions={
              <>
                <Suspense fallback={<div className="size-11" />}>
                  <WishlistSlot productId={product.id} slug={product.slug} />
                </Suspense>
                <ShareButton title={product.name} path={href(`/products/${product.slug}`)} className="grid size-11 place-items-center rounded-full border border-line bg-paper/90 text-forest shadow-sm backdrop-blur hover:border-forest" />
              </>
            }
          />
          <div>
            <h1 className="text-4xl leading-tight sm:text-5xl">{product.name}</h1>
            {product.subtitle && <p className="mt-2 text-lg text-muted">{product.subtitle}</p>}
            {product.rating && (
              <a href="#reviews" className="mt-3 inline-flex items-center gap-2 text-sm hover:underline">
                <Stars rating={product.rating.avg} count={product.rating.count} lang={lang} />
              </a>
            )}
            <div className="mt-6">
              <PurchasePanel
                productName={product.name}
                netUnit={product.netUnit}
                options={product.options}
                variants={product.variants}
                freeShippingThresholdPaise={settings.shipping.freeShippingThresholdPaise}
              />
              <TrustStrip settings={settings} />
            </div>
            <div className="mt-8">
              {boxes.length > 0 && (
                <Detail title={t("What's in the box")} open>
                  {boxes.map((v) => (
                    <div key={v.id} className="mb-2 last:mb-0">
                      {boxes.length > 1 && <p className="font-semibold">{translateParts(lang, v.title)}</p>}
                      <ul className="list-disc pl-5">
                        {contents[v.id].map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </Detail>
              )}
              <Detail title={t("Description")} open>
                <p className="whitespace-pre-line">{product.description}</p>
              </Detail>
              {product.ingredients && (
                <Detail title={t("Ingredients")}>
                  <p>{product.ingredients}</p>
                  {product.allergenInfo && <p className="mt-2 font-semibold">{product.allergenInfo}</p>}
                </Detail>
              )}
              {product.usageInstructions && (
                <Detail title={t("How to use")}>
                  <p className="whitespace-pre-line">{product.usageInstructions}</p>
                </Detail>
              )}
              <Detail title={t("Storage & shelf life")}>
                {product.storageInstructions && <p>{product.storageInstructions}</p>}
                {product.variants[0]?.shelfLife && <p className="mt-2">{t(product.variants[0].shelfLife)}</p>}
              </Detail>
              {product.nutritionInfo && (
                <Detail title={t("Nutrition information")}>
                  <p className="whitespace-pre-line">{product.nutritionInfo}</p>
                </Detail>
              )}
              <Detail title={t("Product information")}>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted">{t("Net quantity")}</dt>
                  <dd>{product.variants.map((v) => translateParts(lang, v.title)).join(", ")}</dd>
                  <dt className="text-muted">{t("MRP")}</dt>
                  <dd>{t("Inclusive of all taxes (shown with each pack size)")}</dd>
                  <dt className="text-muted">{t("Country of origin")}</dt>
                  <dd>{t(product.countryOfOrigin)}</dd>
                  <dt className="text-muted">{t("Packed & marketed by")}</dt>
                  <dd>{store.legalName ? `${store.legalName}, ${[store.addressLine1, store.city, store.state, store.pincode].filter(Boolean).join(", ")}` : t("Details to be added by the store")}</dd>
                  {store.fssaiNumber && (
                    <>
                      <dt className="text-muted">{t("FSSAI Lic. No.")}</dt>
                      <dd>{store.fssaiNumber}</dd>
                    </>
                  )}
                  <dt className="text-muted">{t("Customer care")}</dt>
                  <dd>{[store.supportEmail, store.supportPhone].filter(Boolean).join(" · ") || t("See our contact page")}</dd>
                </dl>
              </Detail>
            </div>
          </div>
        </div>

        <section id="reviews" className="mt-16 scroll-mt-28">
          <SectionHeading title={t("Customer reviews")} />
          {product.reviews.length && product.rating ? (
            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              <div className="card h-fit p-5">
                <p className="font-display text-4xl font-semibold text-forest">
                  {product.rating.avg.toFixed(1)}
                  <span className="text-base font-normal text-muted"> {t("out of 5")}</span>
                </p>
                <Stars rating={product.rating.avg} lang={lang} />
                <p className="mt-1 text-sm text-muted">
                  {t(product.rating.count === 1 ? "{count} review from customers who bought it" : "{count} reviews from customers who bought it", { count: product.rating.count })}
                </p>
                <ul className="mt-4 space-y-1.5" aria-label={t("Reviews by star rating")}>
                  {product.ratingBreakdown.map((b) => {
                    const pct = product.rating ? Math.round((b.count / product.rating.count) * 100) : 0;
                    return (
                      <li key={b.stars} className="flex items-center gap-2 text-sm">
                        <span className="w-12 shrink-0 text-muted">{t("{n} star", { n: b.stars })}</span>
                        <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-sand" aria-hidden="true">
                          <span className="block h-full rounded-full bg-saffron" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="w-10 shrink-0 text-right tabular-nums text-muted">
                          {pct}%<span className="sr-only"> ({b.count})</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="grid content-start gap-4 md:grid-cols-2">
                {product.reviews.map((r) => (
                  <article key={r.id} className="card p-5">
                    <Stars rating={r.rating} lang={lang} />
                    {r.title && <p className="mt-2 font-semibold text-forest">{r.title}</p>}
                    <p className="mt-1 text-sm leading-relaxed text-ink/85">{r.body}</p>
                    <p className="mt-3 text-xs text-muted">
                      {r.authorName} · {t("verified buyer")}{r.city ? ` · ${r.city}` : ""} · {r.createdAt.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted">{t("No reviews yet. Customers can review a product after it's delivered, from their account.")}</p>
          )}
        </section>

        {recipes.length > 0 && (
          <section className="mt-16">
            <SectionHeading title={t("Cook with {name}", { name: product.name })} />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {recipes.map((r) => (
                <RecipeCard key={r.slug} r={r} />
              ))}
            </div>
          </section>
        )}

        {bundle.length > 1 && (
          <section className="mt-16">
            <SectionHeading title={together.length ? t("Often bought together") : t("Complete your spice box")} />
            <BundleBuilder items={bundle} />
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-16">
            <SectionHeading title={t("You might also like")} />
            <ProductGrid products={related} />
          </section>
        )}
      </Container>
    </>
  );
}
