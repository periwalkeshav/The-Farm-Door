import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Listing, parseSort } from "@/components/shop/listing";
import { Container } from "@/components/ui";
import { getCategoryBySlug } from "@/data/catalog";
import { ListingSkeleton } from "@/components/shop/listing-skeleton";

export async function generateMetadata({ params }: PageProps<"/category/[slug]">): Promise<Metadata> {
  const category = await getCategoryBySlug((await params).slug);
  return category ? { title: category.name, description: category.description || undefined } : {};
}

export default function CategoryPage({ params, searchParams }: PageProps<"/category/[slug]">) {
  return (
    <Container className="py-10">
      <Suspense fallback={<ListingSkeleton />}>
        <CategoryContent params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function CategoryContent({ params, searchParams }: Pick<PageProps<"/category/[slug]">, "params" | "searchParams">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
        <Link href="/shop" className="hover:underline">
          Shop
        </Link>{" "}
        / <span className="text-forest">{category.name}</span>
      </nav>
      <h1 className="text-4xl">{category.name}</h1>
      {category.description && <p className="mt-2 mb-6 max-w-2xl text-muted">{category.description}</p>}
      <Listing basePath={`/category/${slug}`} categorySlug={slug} q={typeof sp.q === "string" ? sp.q : undefined} sort={parseSort(sp.sort)} inStockOnly={sp.instock === "1"} />
    </>
  );
}
