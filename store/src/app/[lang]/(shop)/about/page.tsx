import type { Metadata } from "next";
import { ContentPage, ToConfirm } from "@/components/shop/content";
import { LinkButton } from "@/components/ui";
import { getI18n, localizedMetadata } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({ title: "Our story", path: "/about" });
}

export default async function AboutPage() {
  const { t, href } = await getI18n();
  return (
    <ContentPage title="Our story">
      <p>
        {t("The Farm Door is a new spice brand from Jaipur.")} <ToConfirm>your story: who you are, where your spices come from, and why you started</ToConfirm>
      </p>
      <h2>{t("What we sell")}</h2>
      <p>{t("Whole spices, ground spices and masala blends for everyday Indian cooking, in pack sizes that suit your kitchen.")}</p>
      <h2>{t("How we work")}</h2>
      <p>{t("Clear prices with MRP and price per 100 g. Live courier rates and delivery estimates for your pincode, shown before you pay. Tracking from our door to yours.")}</p>
      <div className="mt-8">
        <LinkButton href={href("/shop")}>{t("Shop our spices")}</LinkButton>
      </div>
    </ContentPage>
  );
}
