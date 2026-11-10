import { asc, ne } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { RecipeForm } from "@/components/admin/recipe-form";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { products } from "@/db/schema";

export const metadata = { title: "New recipe" };

export default function NewRecipePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <New />
    </Suspense>
  );
}

async function New() {
  await requireStaff("products.manage");
  const list = await getDb().select({ id: products.id, name: products.name }).from(products).where(ne(products.status, "ARCHIVED")).orderBy(asc(products.name));
  return (
    <>
      <Link href="/admin/recipes" className="text-sm text-muted hover:underline">
        ← Recipes
      </Link>
      <PageHeader title="New recipe" />
      <Panel>
        <RecipeForm products={list} recipe={{ id: null, title: "", slug: "", summary: "", prepMinutes: null, cookMinutes: null, serves: null, ingredients: "", method: "", titleHi: "", summaryHi: "", ingredientsHi: "", methodHi: "", productIds: [], status: "DRAFT", imageId: null }} />
      </Panel>
    </>
  );
}
