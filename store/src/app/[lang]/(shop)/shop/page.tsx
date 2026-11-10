import type { Metadata } from "next";
import { Suspense } from "react";
import { Listing, parseSort } from "@/components/shop/listing";
import { ListingSkeleton } from "@/components/shop/listing-skeleton";
import { Container } from "@/components/ui";
import { getI18n, localizedMetadata } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({ title: "All products", description: "Indian spices and pantry essentials, delivered to your door across India.", path: "/shop" });
}

export default async function ShopPage({ searchParams }: PageProps<"/[lang]/shop">) {
  const { t } = await getI18n();
  return (
    <Container className="py-10">
      <h1 className="mb-6 text-4xl">{t("All products")}</h1>
      <Suspense fallback={<ListingSkeleton />}>
        <ShopResults searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function ShopResults({ searchParams }: { searchParams: PageProps<"/[lang]/shop">["searchParams"] }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  return <Listing basePath="/shop" q={q} sort={parseSort(sp.sort)} inStockOnly={sp.instock === "1"} showCategoryChips autoFocusSearch={sp.focus === "search"} />;
}
