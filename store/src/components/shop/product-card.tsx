import Link from "next/link";
import { Price, Stars } from "@/components/ui";
import { mediaUrl } from "@/lib/media-url";
import type { ProductCard as Card } from "@/server/catalog/queries";

export function ProductCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  const img = mediaUrl(product.imageId, "thumb");
  return (
    <Link href={`/products/${product.slug}`} className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-28px_rgba(31,59,45,.55)]">
      <div className="relative aspect-square overflow-hidden bg-sand">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element -- images are pre-sized WebP served from /media
          <img src={img} alt="" width={600} height={600} loading={priority ? "eager" : "lazy"} decoding="async" className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        ) : null}
        {product.discountPercent > 0 && product.inStock && (
          <span className="absolute top-3 left-3 rounded-full bg-chilli px-2.5 py-1 text-xs font-bold text-white">{product.discountPercent}% off</span>
        )}
        {!product.inStock && <span className="absolute top-3 left-3 rounded-full bg-ink/80 px-2.5 py-1 text-xs font-bold text-white">Sold out</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        {product.categoryName && <p className="text-[11px] font-bold tracking-[.12em] text-muted uppercase">{product.categoryName}</p>}
        <h3 className="font-display text-lg leading-snug text-forest group-hover:underline">{product.name}</h3>
        {product.ratingCount > 0 && product.ratingAvg !== null && <Stars rating={product.ratingAvg} count={product.ratingCount} />}
        <div className="mt-auto pt-2">
          <p className="mb-0.5 text-xs text-muted">{product.variantCount > 1 ? `From · ${product.fromLabel}` : product.fromLabel}</p>
          <Price pricePaise={product.pricePaise} mrpPaise={product.mrpPaise} size="sm" />
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: Card[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}
