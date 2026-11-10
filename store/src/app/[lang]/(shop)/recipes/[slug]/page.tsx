import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductGrid } from "@/components/shop/product-card";
import { Container, SectionHeading, Skeleton } from "@/components/ui";
import { getRecipe, getRecipeProducts } from "@/data/recipes";
import { env } from "@/lib/env";
import { mediaSrcSet, mediaUrl } from "@/lib/media-url";
import { lines } from "@/server/recipes";
import { alternates, getI18n } from "@/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/recipes/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { lang } = await getI18n();
  const r = await getRecipe(slug, lang);
  if (!r) return {};
  const image = mediaUrl(r.imageId, "full");
  return { title: r.title, description: r.summary.slice(0, 160), alternates: alternates(lang, `/recipes/${r.slug}`), openGraph: { title: r.title, description: r.summary, images: image ? [{ url: image }] : undefined } };
}

export default function RecipePage({ params }: PageProps<"/[lang]/recipes/[slug]">) {
  return (
    <Suspense fallback={<Container className="py-12"><Skeleton className="h-96" /></Container>}>
      <RecipeContent params={params} />
    </Suspense>
  );
}

const iso = (minutes: number | null) => (minutes ? `PT${minutes}M` : undefined);

async function RecipeContent({ params }: { params: PageProps<"/[lang]/recipes/[slug]">["params"] }) {
  const { slug } = await params;
  const { lang, t, href } = await getI18n();
  const r = await getRecipe(slug, lang);
  if (!r) notFound();
  const products = await getRecipeProducts(r.productIds, lang);
  const ingredients = lines(r.ingredients);
  const steps = lines(r.method);
  const image = mediaUrl(r.imageId, "full");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: r.title,
    description: r.summary,
    image: image ? [`${env().APP_URL}${image}`] : undefined,
    author: { "@type": "Organization", name: "The Farm Door" },
    datePublished: r.publishedAt?.toISOString().slice(0, 10),
    prepTime: iso(r.prepMinutes),
    cookTime: iso(r.cookMinutes),
    totalTime: iso((r.prepMinutes ?? 0) + (r.cookMinutes ?? 0) || null),
    recipeYield: r.serves ? `${r.serves} servings` : undefined,
    recipeIngredient: ingredients,
    recipeInstructions: steps.map((text) => ({ "@type": "HowToStep", text })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Container className="max-w-4xl py-10">
        <nav aria-label={t("Breadcrumb")} className="mb-5 text-sm text-muted">
          <Link href={href("/recipes")} className="hover:underline">
            {t("Recipes")}
          </Link>
          {" / "}
          <span className="text-forest">{r.title}</span>
        </nav>
        <h1 className="text-4xl leading-tight sm:text-5xl">{r.title}</h1>
        {r.summary && <p className="mt-3 text-lg text-muted">{r.summary}</p>}
        <dl className="mt-5 flex flex-wrap gap-6 text-sm">
          {r.prepMinutes ? (
            <div>
              <dt className="text-muted">{t("Prep")}</dt>
              <dd className="font-semibold">{t("{n} min", { n: r.prepMinutes })}</dd>
            </div>
          ) : null}
          {r.cookMinutes ? (
            <div>
              <dt className="text-muted">{t("Cook")}</dt>
              <dd className="font-semibold">{t("{n} min", { n: r.cookMinutes })}</dd>
            </div>
          ) : null}
          {r.serves ? (
            <div>
              <dt className="text-muted">{t("Serves")}</dt>
              <dd className="font-semibold">{r.serves}</dd>
            </div>
          ) : null}
        </dl>
        {r.imageId && (
          // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP from /media
          <img
            src={mediaUrl(r.imageId, "medium")!}
            srcSet={mediaSrcSet(r.imageId, "photo")}
            sizes="(min-width: 896px) 848px, 100vw"
            alt={r.title}
            width={1600}
            height={900}
            fetchPriority="high"
            className="mt-8 aspect-[16/9] w-full rounded-[var(--radius-card)] object-cover"
          />
        )}
        <div className="mt-10 grid gap-10 md:grid-cols-[1fr_1.6fr]">
          <section>
            <h2 className="mb-3 text-2xl">{t("Ingredients")}</h2>
            <ul className="list-disc space-y-1.5 pl-5">
              {ingredients.map((i, n) => (
                <li key={n}>{i}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-3 text-2xl">{t("Method")}</h2>
            <ol className="space-y-4">
              {steps.map((s, n) => (
                <li key={n} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-forest text-sm font-bold text-ivory">{n + 1}</span>
                  <span className="leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
        {products.length > 0 && (
          <section className="mt-16">
            <SectionHeading title={t("Spices in this recipe")} />
            <ProductGrid products={products} />
          </section>
        )}
      </Container>
    </>
  );
}
