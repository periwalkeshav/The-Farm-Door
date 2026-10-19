import { asc } from "drizzle-orm";
import { Suspense } from "react";
import { GroupForm } from "@/components/admin/product-forms";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { categories, collections } from "@/db/schema";

export const metadata = { title: "Categories & collections" };

export default function CatalogPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <CatalogContent />
    </Suspense>
  );
}

async function CatalogContent() {
  await requireStaff("products.manage");
  const db = getDb();
  const [cats, cols] = await Promise.all([db.select().from(categories).orderBy(asc(categories.sortOrder)), db.select().from(collections).orderBy(asc(collections.sortOrder))]);
  return (
    <>
      <PageHeader title="Categories & collections" description="Categories organise the shop menu (each product has one). Collections are curated groups like Bestsellers; a product can be in several. Add products to collections from the product page." />
      <div className="space-y-6">
        <Panel title="Categories">
          <div className="space-y-2">
            {cats.map((c) => (
              <GroupForm key={c.id} kind="category" group={c} />
            ))}
            <p className="pt-2 text-sm font-semibold text-forest">Add a category</p>
            <GroupForm kind="category" />
          </div>
        </Panel>
        <Panel title="Collections">
          <div className="space-y-2">
            {cols.map((c) => (
              <GroupForm key={c.id} kind="collection" group={c} />
            ))}
            <p className="pt-2 text-sm font-semibold text-forest">Add a collection</p>
            <GroupForm kind="collection" />
          </div>
        </Panel>
      </div>
    </>
  );
}
