import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { NewProductForm } from "@/components/admin/product-forms";
import { Badge, DataTable, PageHeader, Panel, Td } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { categories, inventoryItems, productImages, products, productVariants } from "@/db/schema";
import { formatINR } from "@/lib/money";
import { mediaUrl } from "@/lib/media-url";

export const metadata = { title: "Products" };

export default function ProductsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading products…</p>}>
      <ProductsList />
    </Suspense>
  );
}

async function ProductsList() {
  await requireStaff("products.manage");
  const db = getDb();
  const cats = await db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.sortOrder));
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      status: products.status,
      category: categories.name,
      variants: sql<number>`(select count(*) from ${productVariants} v where v.product_id = ${products.id} and v.is_active)::int`,
      minPrice: sql<number | null>`(select min(price_paise) from ${productVariants} v where v.product_id = ${products.id} and v.is_active)`,
      maxPrice: sql<number | null>`(select max(price_paise) from ${productVariants} v where v.product_id = ${products.id} and v.is_active)`,
      soldOut: sql<number>`(select count(*) from ${productVariants} v join ${inventoryItems} i on i.id = v.inventory_item_id where v.product_id = ${products.id} and v.is_active and (i.on_hand - i.reserved) < v.units_per_sale)::int`,
      image: sql<number | null>`(select media_id from ${productImages} pi where pi.product_id = ${products.id} order by sort_order, id limit 1)`,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .orderBy(asc(products.status), asc(products.name));

  return (
    <>
      <PageHeader title="Products" description="Everything in your catalogue. Drafts and archived products are hidden from the shop." />
      <Panel className="mb-6">
        <NewProductForm categories={cats} />
      </Panel>
      <DataTable head={["Product", "Status", "Category", "Variants", "Price", "Stock"]} empty={rows.length === 0}>
        {rows.map((p) => (
          <tr key={p.id} className="hover:bg-ivory">
            <Td>
              <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 font-semibold text-forest hover:underline">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image ? <img src={mediaUrl(p.image, "thumb")!} alt="" className="size-10 rounded-lg object-cover" /> : <span className="size-10 rounded-lg bg-sand" />}
                {p.name}
              </Link>
            </Td>
            <Td>
              <Badge tone={p.status === "ACTIVE" ? "good" : p.status === "DRAFT" ? "warn" : "neutral"}>{p.status.toLowerCase()}</Badge>
            </Td>
            <Td className="text-muted">{p.category ?? "—"}</Td>
            <Td>{p.variants}</Td>
            <Td className="whitespace-nowrap">{p.minPrice === null ? "—" : p.minPrice === p.maxPrice ? formatINR(p.minPrice) : `${formatINR(p.minPrice)}–${formatINR(p.maxPrice!)}`}</Td>
            <Td>{p.soldOut > 0 ? <Badge tone="bad">{p.soldOut} sold out</Badge> : <span className="text-muted">OK</span>}</Td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
