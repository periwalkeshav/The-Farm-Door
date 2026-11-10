import Link from "next/link";
import { Stars } from "@/components/ui";
import { mediaSrcSet, mediaUrl } from "@/lib/media-url";
import type { ProductCard as Card } from "@/server/catalog/queries";
import { localePath, type Locale } from "@/i18n/config";
import { getLang } from "@/i18n/server";
import { translator } from "@/i18n/translate";
import { QuickAdd } from "./quick-add";

/**
 * A product in a grid. The name is the link and covers the whole card; the
 * pack dropdown and "Add to cart" button sit above it, so they work without
 * opening the page.
 */
export function ProductCard({ product, priority = false, lang = "en" }: { product: Card; priority?: boolean; lang?: Locale }) {
  const t = translator(lang);
  const img = mediaUrl(product.imageId, "thumb");
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-28px_rgba(31,59,45,.55)]">
      <div className="relative aspect-square overflow-hidden bg-sand">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element -- images are pre-sized WebP served from /media
          <img
            src={img}
            srcSet={mediaSrcSet(product.imageId!, "square")}
            sizes="(min-width: 1152px) 270px, (min-width: 1024px) 23vw, 48vw"
            alt=""
            width={600}
            height={600}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            decoding="async"
            className="size-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : null}
        {product.discountPercent > 0 && product.inStock && (
          <span className="absolute top-3 left-3 rounded-full bg-chilli px-2.5 py-1 text-xs font-bold text-white">
            {product.sale ? `${product.sale.name} · ` : ""}
            {t("{percent}% off", { percent: product.discountPercent })}
          </span>
        )}
        {!product.inStock && <span className="absolute top-3 left-3 rounded-full bg-ink/80 px-2.5 py-1 text-xs font-bold text-white">{t("Sold out")}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        {product.categoryName && <p className="text-[11px] font-bold tracking-[.12em] text-muted uppercase">{product.categoryName}</p>}
        <h3 className="font-display text-lg leading-snug text-forest">
          <Link href={localePath(lang, `/products/${product.slug}`)} className="after:absolute after:inset-0 after:rounded-[var(--radius-card)] group-hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-saffron">
            {product.name}
          </Link>
        </h3>
        {product.ratingCount > 0 && product.ratingAvg !== null && <Stars rating={product.ratingAvg} count={product.ratingCount} lang={lang} />}
        <QuickAdd product={product} />
      </div>
    </article>
  );
}

export async function ProductGrid({ products, priorityCount = 0, ranked = false }: { products: Card[]; priorityCount?: number; ranked?: boolean }) {
  const lang = await getLang();
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
      {products.map((p, i) =>
        ranked ? (
          // Bestsellers: a big rank number beside each card, the card overlapping its edge.
          <div key={p.id} className="relative pl-4 sm:pl-10">
            <span aria-hidden="true" className="rank-number pointer-events-none absolute top-1 left-0 font-display text-[2.75rem] leading-none font-bold select-none sm:text-[5.5rem]">
              {i + 1}
            </span>
            <div className="relative h-full">
              <ProductCard product={p} priority={i < priorityCount} lang={lang} />
            </div>
          </div>
        ) : (
          <ProductCard key={p.id} product={p} priority={i < priorityCount} lang={lang} />
        ),
      )}
    </div>
  );
}
