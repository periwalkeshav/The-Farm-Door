import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DeleteProductButton, ImageManager, ProductDetailsForm } from "@/components/admin/product-forms";
import { Badge, Panel } from "@/components/admin/ui";
import { VariantEditor, type EditorVariant } from "@/components/admin/variant-editor";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { categories, collectionProducts, collections, inventoryItems, products, productVariants } from "@/db/schema";
import { paiseToRupeesString } from "@/lib/money";
import { listProductImages } from "@/server/catalog/admin";

export const metadata = { title: "Edit product" };

export default function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading product…</p>}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/admin/products/[id]">["params"] }) {
  await requireStaff("products.manage");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) notFound();
  const [variants, pools, images, cats, cols, members] = await Promise.all([
    db.select({ v: productVariants, pool: inventoryItems }).from(productVariants).innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId)).where(eq(productVariants.productId, id)).orderBy(asc(productVariants.sortOrder)),
    db.select().from(inventoryItems).where(eq(inventoryItems.unit, "GRAM")).orderBy(asc(inventoryItems.name)),
    listProductImages(db, id),
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.sortOrder)),
    db.select({ id: collections.id, name: collections.name }).from(collections).orderBy(asc(collections.sortOrder)),
    db.select({ id: collectionProducts.collectionId }).from(collectionProducts).where(eq(collectionProducts.productId, id)),
  ]);
  const activeVariants = variants.filter((x) => x.v.isActive);
  const editorVariants: EditorVariant[] = activeVariants.map(({ v, pool }) => ({
    id: v.id,
    optionValues: v.optionValues,
    sku: v.sku,
    price: paiseToRupeesString(v.pricePaise),
    mrp: paiseToRupeesString(v.mrpPaise),
    netWeightGrams: v.netWeightGrams,
    shippingWeightGrams: v.shippingWeightGrams,
    hsnCode: v.hsnCode,
    gstRatePercent: v.gstRateBp / 100,
    isActive: v.isActive,
    shelfLifeOverride: v.shelfLifeOverride,
    pool: { id: pool.id, name: pool.name, unit: pool.unit, available: pool.onHand - pool.reserved },
    stockChoice: "keep",
    initialQty: 0,
  }));
  const archived = variants.filter((x) => !x.v.isActive);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/products" className="text-sm text-muted hover:underline">
            ← Products
          </Link>
          <h1 className="mt-1 flex items-center gap-3 font-display text-3xl">
            {product.name} <Badge tone={product.status === "ACTIVE" ? "good" : "warn"}>{product.status.toLowerCase()}</Badge>
          </h1>
        </div>
        {product.status === "ACTIVE" && (
          <a href={`/products/${product.slug}`} target="_blank" className="text-sm font-semibold text-forest underline">
            View in shop ↗
          </a>
        )}
      </div>
      <div className="space-y-6">
        <Panel title="Pack sizes, prices & stock">
          <VariantEditor
            productId={product.id}
            productCode={product.slug.replace(/[^a-z]/g, "").slice(0, 6).toUpperCase()}
            initialOptions={product.options}
            initialVariants={editorVariants}
            bulkPools={pools.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name, available: p.onHand - p.reserved }))}
          />
          {archived.length > 0 && (
            <p className="mt-3 text-xs text-muted">
              {archived.length} archived variant{archived.length === 1 ? "" : "s"} kept for order history: {archived.map((a) => a.v.sku).join(", ")}. Add the same option values again to bring one back as a new variant.
            </p>
          )}
        </Panel>
        <Panel title="Photos">
          <ImageManager productId={product.id} images={images.map((i) => ({ id: i.id, mediaId: i.mediaId, alt: i.alt }))} />
        </Panel>
        <Panel title="Details">
          <ProductDetailsForm
            productId={product.id}
            details={{ ...product }}
            categories={cats}
            collections={cols}
            memberOf={members.map((m) => m.id)}
          />
        </Panel>
        <Panel>
          <DeleteProductButton productId={product.id} />
        </Panel>
      </div>
    </>
  );
}
