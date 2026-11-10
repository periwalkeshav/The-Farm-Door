import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Listing, parseSort } from "@/components/shop/listing";
import { Container } from "@/components/ui";
import { alternates, getI18n } from "@/i18n/server";
import { getCategoryBySlug, getCategoryGroups } from "@/data/catalog";
import { ListingSkeleton } from "@/components/shop/listing-skeleton";

export async function generateMetadata({ params }: PageProps<"/[lang]/category/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { lang } = await getI18n();
  const category = await getCategoryBySlug(slug, lang);
  return category ? { title: category.name, description: category.description || undefined, alternates: alternates(lang, `/category/${slug}`) } : {};
}

export default function CategoryPage({ params, searchParams }: PageProps<"/[lang]/category/[slug]">) {
  return (
    <Container className="py-10">
      <Suspense fallback={<ListingSkeleton />}>
        <CategoryContent params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function CategoryContent({ params, searchParams }: Pick<PageProps<"/[lang]/category/[slug]">, "params" | "searchParams">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const { lang, t, href } = await getI18n();
  const category = await getCategoryBySlug(slug, lang);
  if (!category) notFound();
  // Collections set to show inside this category ("Whole spices" in Spices) become filter buttons.
  const groups = await getCategoryGroups(category.id, lang);
  const group = groups.find((g) => g.slug === sp.group);
  const base = href(`/category/${slug}`);
  const chips = groups.length ? [{ href: base, label: t("All"), current: !group }, ...groups.map((g) => ({ href: `${base}?group=${g.slug}`, label: g.name, current: g.slug === group?.slug }))] : undefined;
  return (
    <>
      <nav aria-label={t("Breadcrumb")} className="mb-3 text-sm text-muted">
        <Link href={href("/shop")} className="hover:underline">
          {t("Shop")}
        </Link>{" "}
        / <span className="text-forest">{category.name}</span>
      </nav>
      <h1 className="text-4xl">{category.name}</h1>
      {category.description && <p className="mt-2 mb-6 max-w-2xl text-muted">{category.description}</p>}
      <Listing
        basePath={`/category/${slug}`}
        categorySlug={slug}
        collectionSlug={group?.slug}
        keep={group ? { group: group.slug } : undefined}
        chips={chips}
        chipsLabel={t("Filter {name}", { name: category.name })}
        q={typeof sp.q === "string" ? sp.q : undefined}
        sort={parseSort(sp.sort)}
        inStockOnly={sp.instock === "1"}
      />
    </>
  );
}
