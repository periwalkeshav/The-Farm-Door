import type { Metadata } from "next";
import { RecipeCard } from "@/components/shop/recipe-card";
import { Container } from "@/components/ui";
import { getRecipes } from "@/data/recipes";
import { getI18n, localizedMetadata } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({ title: "Recipes", description: "Everyday Indian recipes using The Farm Door's spices, with the exact spices you need.", path: "/recipes" });
}

export default async function RecipesPage() {
  const { lang, t } = await getI18n();
  const list = await getRecipes(lang);
  return (
    <Container className="py-12">
      <p className="mb-2 text-sm font-bold tracking-wide text-saffron-deep uppercase">{t("From our kitchen")}</p>
      <h1 className="text-4xl sm:text-5xl">{t("Recipes")}</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">{t("Simple, everyday cooking with the spices we sell. Each recipe lists the spices it uses, so you can add them to your cart in one go.")}</p>
      {list.length ? (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <RecipeCard key={r.id} r={r} />
          ))}
        </div>
      ) : (
        <p className="mt-10 text-muted">{t("Recipes are coming soon.")}</p>
      )}
    </Container>
  );
}
