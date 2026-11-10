import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/shop/content";
import { getPublicSettings } from "@/data/catalog";
import { getI18n, localizedMetadata } from "@/i18n/server";
import { formatINR } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({ title: "Frequently asked questions", path: "/faq" });
}

export default async function FaqPage() {
  const { t, href } = await getI18n();
  const { shipping, cod } = await getPublicSettings();
  const faqs: { q: string; a: React.ReactNode }[] = [
    {
      q: t("Do you deliver to my pincode?"),
      a: t("Enter your pincode on any product page or in your cart. We check with our courier partners and show whether we can deliver, the estimated date and the shipping cost."),
    },
    {
      q: t("How much is shipping?"),
      a: (
        <>
          {t("Shipping is the courier's rate for your pincode and parcel weight, shown before you pay.")}
          {shipping.freeShippingThresholdPaise !== null && <> {t("Orders over {amount} ship free.", { amount: formatINR(shipping.freeShippingThresholdPaise) })}</>}
        </>
      ),
    },
    {
      q: t("How do I pay?"),
      a: t(cod.enabled ? "By UPI, debit or credit card, net banking or wallet through Razorpay, or cash on delivery for eligible orders." : "By UPI, debit or credit card, net banking or wallet through Razorpay."),
    },
    { q: t("Do I need an account to order?"), a: t("No. You can check out as a guest. Signing in lets you save addresses and see all your orders in one place.") },
    {
      q: t("How do I track my order?"),
      a: (
        <>
          {t("We email you a tracking link when your order ships. You can also use")} <Link href={href("/track")}>{t("Track your order")}</Link> {t("with your order number and email or mobile number.")}
        </>
      ),
    },
    { q: t("Can I cancel my order?"), a: t("Yes, from your order page, until we pack it. Online payments are refunded in full to your original payment method.") },
    { q: t("What if something arrives damaged?"), a: t("Tell us within 48 hours of delivery with photos and we'll send a replacement or refund it.") },
    { q: t("Can I get a GST invoice for my business?"), a: t("Yes. Add your GSTIN and business name at checkout and your invoice will be issued in your business name.") },
    { q: t("How should I store spices?"), a: t("In an airtight container, in a cool, dry place away from sunlight, and always with a dry spoon.") },
  ];
  return (
    <ContentPage title="Frequently asked questions" draft={false}>
      {faqs.map((f) => (
        <details key={f.q} className="border-b border-line py-4">
          <summary className="cursor-pointer font-display text-lg font-semibold text-forest">{f.q}</summary>
          <p className="mt-2">{f.a}</p>
        </details>
      ))}
    </ContentPage>
  );
}
