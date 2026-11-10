import { asc, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RecipeForm } from "@/components/admin/recipe-form";
import { PageHeader, Panel } from "@/components/admin/ui";
import { Notice } from "@/components/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { products, recipes } from "@/db/schema";

export const metadata = { title: "Recipe" };

export default function EditRecipePage({ params, searchParams }: PageProps<"/admin/recipes/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Edit params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Edit({ params, searchParams }: Pick<PageProps<"/admin/recipes/[id]">, "params" | "searchParams">) {
  await requireStaff("products.manage");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const [r] = await db.select().from(recipes).where(eq(recipes.id, id));
  if (!r) notFound();
  const list = await db.select({ id: products.id, name: products.name }).from(products).where(ne(products.status, "ARCHIVED")).orderBy(asc(products.name));
  const created = (await searchParams).created === "1";
  return (
    <>
      <Link href="/admin/recipes" className="text-sm text-muted hover:underline">
        ← Recipes
      </Link>
      <PageHeader
        title={r.title}
        actions={
          r.status === "PUBLISHED" ? (
            <a href={`/recipes/${r.slug}`} target="_blank" className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest">
              View on the shop ↗
            </a>
          ) : null
        }
      />
      {created && <Notice tone="success" className="mb-4">Recipe created as a draft. Publish it when it&apos;s ready.</Notice>}
      <Panel>
        <RecipeForm products={list} recipe={r} />
      </Panel>
    </>
  );
}
