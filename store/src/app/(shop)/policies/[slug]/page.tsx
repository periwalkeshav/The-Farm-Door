import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { businessLine, ContentPage, ToConfirm } from "@/components/shop/content";
import { getPublicSettings } from "@/data/catalog";
import { formatINR } from "@/lib/money";

const TITLES: Record<string, string> = {
  shipping: "Shipping & delivery",
  refunds: "Cancellations, returns & refunds",
  privacy: "Privacy policy",
  terms: "Terms of service",
};

export function generateStaticParams() {
  return Object.keys(TITLES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/policies/[slug]">): Promise<Metadata> {
  const title = TITLES[(await params).slug];
  return title ? { title } : {};
}

export default async function PolicyPage({ params }: PageProps<"/policies/[slug]">) {
  const { slug } = await params;
  if (!TITLES[slug]) notFound();
  const { store, shipping, cod } = await getPublicSettings();
  const biz = businessLine(store);
  const contact = (
    <>
      {store.supportEmail || <ToConfirm>support email</ToConfirm>}, {store.supportPhone || <ToConfirm>support phone</ToConfirm>}
    </>
  );

  if (slug === "shipping") {
    return (
      <ContentPage title={TITLES.shipping}>
        <h2>Where we deliver</h2>
        <p>We deliver across India through courier partners. When you enter your pincode on a product page, in your cart or at checkout, we check with the courier whether they serve it. If no courier can deliver to your pincode, we can&apos;t accept the order.</p>
        <h2>Shipping charges</h2>
        <p>
          Shipping is the courier&apos;s rate for your pincode and the weight of your parcel, worked out live and shown before you pay.
          {shipping.freeShippingThresholdPaise !== null && <> Orders of {formatINR(shipping.freeShippingThresholdPaise)} or more (after discounts) ship free.</>}
        </p>
        <h2>Dispatch and delivery times</h2>
        <p>
          We usually dispatch orders within <ToConfirm>number of working days</ToConfirm> of confirmation, from {store.city || "our warehouse"}. Delivery estimates come from the courier for your pincode and are shown at checkout; they are estimates, not guarantees, and remote areas can take longer.
        </p>
        <p>Once your order ships, we email you the courier name, tracking number and a tracking link. You can also follow it on our <Link href="/track">Track your order</Link> page.</p>
        {cod.enabled && (
          <>
            <h2>Cash on delivery</h2>
            <p>
              Cash on delivery is available for eligible pincodes
              {cod.maxOrderPaise !== null && <> on orders up to {formatINR(cod.maxOrderPaise)}</>}
              {cod.feePaise > 0 && <>, with a fee of {formatINR(cod.feePaise)}</>}. After placing a cash-on-delivery order we email you a link to confirm it; unconfirmed orders are cancelled after {cod.confirmationHours} hours.
            </p>
          </>
        )}
        <h2>If delivery fails</h2>
        <p>
          Couriers usually attempt delivery more than once. If a parcel can&apos;t be delivered and comes back to us, we&apos;ll contact you. For prepaid orders returned because of an incorrect address or refused delivery, <ToConfirm>refund policy for returned parcels, e.g. refund minus shipping charges</ToConfirm>.
        </p>
        <h2>Damaged parcels</h2>
        <p>If your parcel arrives damaged or tampered with, please tell us within 48 hours of delivery with photos, at {contact}.</p>
      </ContentPage>
    );
  }

  if (slug === "refunds") {
    return (
      <ContentPage title={TITLES.refunds}>
        <h2>Cancelling an order</h2>
        <p>You can cancel an order from your order page until we pack it. After that, please contact us at {contact}; we&apos;ll help if the courier hasn&apos;t picked it up yet.</p>
        <h2>Returns</h2>
        <p>Because our products are food, we can&apos;t accept returns of opened products or products that were delivered as ordered and in good condition.</p>
        <h2>Damaged, wrong or expired items</h2>
        <p>If an item arrives damaged, is not what you ordered, or is past its best-before date, tell us within 48 hours of delivery with photos of the item and packaging. We&apos;ll send a replacement or give you a refund.</p>
        <h2>How refunds are paid</h2>
        <ul>
          <li>Online payments are refunded to your original payment method through Razorpay. Banks usually take 5–7 working days to show the refund.</li>
          <li>Cash-on-delivery orders are refunded by UPI or bank transfer to details you give us.</li>
        </ul>
        <p>We&apos;ll email you when a refund is issued.</p>
      </ContentPage>
    );
  }

  if (slug === "privacy") {
    return (
      <ContentPage title={TITLES.privacy}>
        <p>
          This policy explains how {biz.name} (&quot;we&quot;) collects and uses your personal data when you use thefarmdoor.com, in line with India&apos;s Digital Personal Data Protection Act, 2023.
        </p>
        <h2>What we collect</h2>
        <ul>
          <li>Contact details: name, email address and mobile number.</li>
          <li>Delivery and billing details: address, pincode and, if you give it, your GSTIN and business name.</li>
          <li>Order history, reviews you write and messages you send us.</li>
          <li>Technical data needed to run the site securely, such as your IP address and browser type.</li>
        </ul>
        <p>We don&apos;t see or store your card, UPI PIN or bank login details. Payments are handled by Razorpay.</p>
        <h2>Why we use it</h2>
        <ul>
          <li>To process, deliver and support your orders, and send order updates.</li>
          <li>To issue GST invoices and keep the records Indian tax law requires.</li>
          <li>To prevent fraud and keep the site secure.</li>
          <li>To send newsletters and offers, only if you&apos;ve agreed. You can unsubscribe at any time.</li>
        </ul>
        <h2>Who we share it with</h2>
        <p>
          Only with service providers who help us run the shop, and only what they need: our courier partners (delivery details), Razorpay (payment), our email provider (emails to you), our hosting provider, and <ToConfirm>analytics provider, if used</ToConfirm>. We don&apos;t sell your data.
        </p>
        <h2>How long we keep it</h2>
        <p>We keep order and invoice records for as long as tax and accounting law requires. You can ask us to delete your account at any time from your account page; we&apos;ll delete everything we aren&apos;t legally required to keep.</p>
        <h2>Your rights</h2>
        <p>You can ask to see, correct or delete your personal data, or withdraw consent for marketing, by writing to {contact}.</p>
        <h2>Grievance officer</h2>
        <p>
          <ToConfirm>name of grievance officer</ToConfirm>, {biz.name}, {biz.address || <ToConfirm>registered address</ToConfirm>}. Email: {store.supportEmail || <ToConfirm>email</ToConfirm>}.
        </p>
        <h2>Cookies</h2>
        <p>We use essential cookies to keep you signed in and remember your cart. <ToConfirm>analytics/advertising cookies, if added, and how consent is collected</ToConfirm></p>
      </ContentPage>
    );
  }

  return (
    <ContentPage title={TITLES.terms}>
      <h2>About us</h2>
      <p>
        thefarmdoor.com is operated by {biz.name}
        {biz.address ? `, ${biz.address}` : ""}
        {store.gstin ? ` (GSTIN ${store.gstin})` : ""}
        {store.fssaiNumber ? `, FSSAI Lic. No. ${store.fssaiNumber}` : ""}.
      </p>
      <h2>Products and prices</h2>
      <p>Prices are in Indian rupees and include GST. We show the MRP for each pack size. Product photos are for illustration; packaging may vary. We try to describe products accurately; if something is wrong, please tell us.</p>
      <h2>Orders</h2>
      <p>An order is confirmed when we receive your online payment, or when you confirm a cash-on-delivery order. We may cancel an order (and refund any payment in full) if an item is unavailable, a price was shown incorrectly, or we suspect fraud.</p>
      <h2>Payment, delivery, cancellations and refunds</h2>
      <p>
        See our <Link href="/policies/shipping">shipping policy</Link> and <Link href="/policies/refunds">cancellations, returns &amp; refunds</Link> policy.
      </p>
      <h2>Liability</h2>
      <p>
        Nothing in these terms limits your rights under the Consumer Protection Act, 2019. <ToConfirm>limitation-of-liability wording reviewed by your lawyer</ToConfirm>
      </p>
      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of India. Courts at <ToConfirm>city, e.g. Jaipur</ToConfirm> have jurisdiction.
      </p>
      <h2>Contact</h2>
      <p>{contact}</p>
    </ContentPage>
  );
}
