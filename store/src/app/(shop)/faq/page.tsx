import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/shop/content";
import { getPublicSettings } from "@/data/catalog";
import { formatINR } from "@/lib/money";

export const metadata: Metadata = { title: "Frequently asked questions" };

export default async function FaqPage() {
  const { shipping, cod } = await getPublicSettings();
  const faqs: { q: string; a: React.ReactNode }[] = [
    {
      q: "Do you deliver to my pincode?",
      a: "Enter your pincode on any product page or in your cart. We check with our courier partners and show whether we can deliver, the estimated date and the shipping cost.",
    },
    {
      q: "How much is shipping?",
      a: (
        <>
          Shipping is the courier&apos;s rate for your pincode and parcel weight, shown before you pay.
          {shipping.freeShippingThresholdPaise !== null && <> Orders over {formatINR(shipping.freeShippingThresholdPaise)} ship free.</>}
        </>
      ),
    },
    { q: "How do I pay?", a: `By UPI, debit or credit card, net banking or wallet through Razorpay${cod.enabled ? ", or cash on delivery for eligible orders" : ""}.` },
    { q: "Do I need an account to order?", a: "No. You can check out as a guest. Signing in lets you save addresses and see all your orders in one place." },
    {
      q: "How do I track my order?",
      a: (
        <>
          We email you a tracking link when your order ships. You can also use <Link href="/track">Track your order</Link> with your order number and email or mobile number.
        </>
      ),
    },
    { q: "Can I cancel my order?", a: "Yes, from your order page, until we pack it. Online payments are refunded in full to your original payment method." },
    { q: "What if something arrives damaged?", a: "Tell us within 48 hours of delivery with photos and we'll send a replacement or refund it." },
    { q: "Can I get a GST invoice for my business?", a: "Yes. Add your GSTIN and business name at checkout and your invoice will be issued in your business name." },
    { q: "How should I store spices?", a: "In an airtight container, in a cool, dry place away from sunlight, and always with a dry spoon." },
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
