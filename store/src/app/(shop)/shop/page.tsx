import type { Metadata } from "next";
import { Suspense } from "react";
import { Listing, parseSort } from "@/components/shop/listing";
import { ListingSkeleton } from "@/components/shop/listing-skeleton";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Shop all spices",
  description: "Whole spices, ground spices and masala blends, delivered across India.",
};

export default function ShopPage({ searchParams }: PageProps<"/shop">) {
  return (
    <Container className="py-10">
      <h1 className="mb-6 text-4xl">Shop all spices</h1>
      <Suspense fallback={<ListingSkeleton />}>
        <ShopResults searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function ShopResults({ searchParams }: { searchParams: PageProps<"/shop">["searchParams"] }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  return <Listing basePath="/shop" q={q} sort={parseSort(sp.sort)} inStockOnly={sp.instock === "1"} showCategoryChips autoFocusSearch={sp.focus === "search"} />;
}
