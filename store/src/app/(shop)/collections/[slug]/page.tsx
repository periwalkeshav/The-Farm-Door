import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Listing, parseSort } from "@/components/shop/listing";
import { Container } from "@/components/ui";
import { getCollectionBySlug } from "@/data/catalog";
import { ListingSkeleton } from "@/components/shop/listing-skeleton";

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const collection = await getCollectionBySlug((await params).slug);
  return collection ? { title: collection.name, description: collection.description || undefined } : {};
}

export default function CollectionPage({ params, searchParams }: PageProps<"/collections/[slug]">) {
  return (
    <Container className="py-10">
      <Suspense fallback={<ListingSkeleton />}>
        <CollectionContent params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function CollectionContent({ params, searchParams }: Pick<PageProps<"/collections/[slug]">, "params" | "searchParams">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const collection = await getCollectionBySlug(slug);
  if (!collection) notFound();
  return (
    <>
      <h1 className="text-4xl">{collection.name}</h1>
      {collection.description && <p className="mt-2 mb-6 max-w-2xl text-muted">{collection.description}</p>}
      <Listing basePath={`/collections/${slug}`} collectionSlug={slug} q={typeof sp.q === "string" ? sp.q : undefined} sort={parseSort(sp.sort)} inStockOnly={sp.instock === "1"} />
    </>
  );
}
