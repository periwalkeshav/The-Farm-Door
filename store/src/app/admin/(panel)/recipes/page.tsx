import { desc } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, DataTable, PageHeader, Td } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { recipes } from "@/db/schema";

export const metadata = { title: "Recipes" };

export default function RecipesAdminPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading recipes…</p>}>
      <List />
    </Suspense>
  );
}

async function List() {
  await requireStaff("products.manage");
  const rows = await getDb().select().from(recipes).orderBy(desc(recipes.updatedAt));
  return (
    <>
      <PageHeader
        title="Recipes"
        description="Recipes appear at /recipes and on the product pages of the spices they use. Good recipes bring visitors from Google."
        actions={
          <Link href="/admin/recipes/new" className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-ivory">
            New recipe
          </Link>
        }
      />
      <DataTable head={["Recipe", "Status", "Spices linked", "Updated"]} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-ivory">
            <Td>
              <Link href={`/admin/recipes/${r.id}`} className="font-semibold text-forest hover:underline">
                {r.title}
              </Link>
            </Td>
            <Td>
              <Badge tone={r.status === "PUBLISHED" ? "good" : "warn"}>{r.status === "PUBLISHED" ? "published" : "draft"}</Badge>
            </Td>
            <Td>{r.productIds.length}</Td>
            <Td className="text-muted">{r.updatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
