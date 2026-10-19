import type { Metadata } from "next";
import Link from "next/link";
import { businessLine, ContentPage, ToConfirm } from "@/components/shop/content";
import { getPublicSettings } from "@/data/catalog";

export const metadata: Metadata = { title: "Contact us" };

export default async function ContactPage() {
  const { store } = await getPublicSettings();
  const biz = businessLine(store);
  const wa = store.whatsappNumber.replace(/\D/g, "");
  return (
    <ContentPage title="Contact us" draft={false}>
      <p>We&apos;re happy to help with orders, deliveries, bulk and business purchases, or anything else.</p>
      <ul>
        <li>Email: {store.supportEmail ? <a href={`mailto:${store.supportEmail}`}>{store.supportEmail}</a> : <ToConfirm>support email</ToConfirm>}</li>
        <li>Phone: {store.supportPhone || <ToConfirm>support phone and hours</ToConfirm>}</li>
        {wa && (
          <li>
            WhatsApp: <a href={`https://wa.me/${wa.length === 10 ? `91${wa}` : wa}`}>chat with us</a>
          </li>
        )}
      </ul>
      <h2>Bulk and business orders</h2>
      <p>Buying for a restaurant, shop or event? Email us with the products and quantities you need and your GSTIN, and we&apos;ll send a quote.</p>
      <h2>Order questions</h2>
      <p>
        Please include your order number. You can also <Link href="/track">track your order</Link> online.
      </p>
      <h2>Business details</h2>
      <p>
        {biz.name}
        <br />
        {biz.address || <ToConfirm>registered address</ToConfirm>}
        {store.gstin && (
          <>
            <br />
            GSTIN: {store.gstin}
          </>
        )}
        {store.fssaiNumber && (
          <>
            <br />
            FSSAI Lic. No.: {store.fssaiNumber}
          </>
        )}
      </p>
    </ContentPage>
  );
}
