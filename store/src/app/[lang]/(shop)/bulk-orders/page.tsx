import type { Metadata } from "next";
import { EnquiryForm } from "@/components/shop/enquiry-form";
import { Container } from "@/components/ui";
import { getI18n, localizedMetadata } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: "Bulk and business orders",
    description: "Spices in larger quantities for restaurants, shops, caterers and corporate gifting, with GST invoices.",
    path: "/bulk-orders",
  });
}

export default async function BulkOrdersPage() {
  const { t } = await getI18n();
  return (
    <Container className="py-12">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <div>
          <p className="mb-2 text-sm font-bold tracking-wide text-saffron-deep uppercase">{t("For businesses")}</p>
          <h1 className="text-4xl sm:text-5xl">{t("Bulk and business orders")}</h1>
          <p className="mt-4 text-lg text-muted">{t("Buying for a restaurant, shop, caterer, event or corporate gifting? Tell us what you need and we'll reply with prices and availability.")}</p>
          <ul className="mt-6 space-y-3 text-sm">
            <li className="card p-4">
              <span className="font-semibold text-forest">{t("Larger quantities.")}</span> {t("Ask for loose quantities or a number of packs.")}
            </li>
            <li className="card p-4">
              <span className="font-semibold text-forest">{t("GST invoice.")}</span> {t("Add your GSTIN and we'll invoice your business.")}
            </li>
            <li className="card p-4">
              <span className="font-semibold text-forest">{t("Small business order?")}</span> {t("You can also order straight from the shop and enter your GSTIN at checkout.")}
            </li>
          </ul>
        </div>
        <div className="card p-6 sm:p-8">
          <h2 className="mb-5 text-2xl">{t("Send an enquiry")}</h2>
          <EnquiryForm />
        </div>
      </div>
    </Container>
  );
}
