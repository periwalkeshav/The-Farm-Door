import type { Metadata } from "next";
import Link from "next/link";
import { businessLine, ContentPage, ToConfirm } from "@/components/shop/content";
import { getPublicSettings } from "@/data/catalog";
import { getI18n, localizedMetadata } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({ title: "Contact us", path: "/contact" });
}

export default async function ContactPage() {
  const { t, href } = await getI18n();
  const { store } = await getPublicSettings();
  const biz = businessLine(store);
  const wa = store.whatsappNumber.replace(/\D/g, "");
  return (
    <ContentPage title="Contact us" draft={false}>
      <p>{t("We're happy to help with orders, deliveries, bulk and business purchases, or anything else.")}</p>
      <ul>
        <li>{t("Email:")} {store.supportEmail ? <a href={`mailto:${store.supportEmail}`}>{store.supportEmail}</a> : <ToConfirm>support email</ToConfirm>}</li>
        <li>
          {t("Phone:")} {store.supportPhone || <ToConfirm>support phone</ToConfirm>}
          {store.supportHours && <> ({store.supportHours})</>}
        </li>
        {wa && (
          <li>
            WhatsApp: <a href={`https://wa.me/${wa.length === 10 ? `91${wa}` : wa}`}>{t("chat with us")}</a>
          </li>
        )}
      </ul>
      <h2>{t("Bulk and business orders")}</h2>
      <p>
        {t("Buying for a restaurant, shop or event?")} <Link href={href("/bulk-orders")}>{t("Send a bulk enquiry")}</Link> {t("with the products and quantities you need, and we'll reply with prices.")}
      </p>
      <h2>{t("Order questions")}</h2>
      <p>
        {t("Please include your order number. You can also")} <Link href={href("/track")}>{t("track your order")}</Link> {t("online.")}
      </p>
      <h2>{t("Business details")}</h2>
      <p>
        {biz.name}
        <br />
        {biz.address || <ToConfirm>registered address</ToConfirm>}
        {store.cin && (
          <>
            <br />
            CIN: {store.cin}
          </>
        )}
        {store.gstin && (
          <>
            <br />
            GSTIN: {store.gstin}
          </>
        )}
        {store.fssaiNumber && (
          <>
            <br />
            {t("FSSAI Lic. No.")}: {store.fssaiNumber}
          </>
        )}
      </p>
    </ContentPage>
  );
}
