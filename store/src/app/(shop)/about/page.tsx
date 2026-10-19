import type { Metadata } from "next";
import { ContentPage, ToConfirm } from "@/components/shop/content";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "Our story" };

export default function AboutPage() {
  return (
    <ContentPage title="Our story">
      <p>
        The Farm Door is a new spice brand from Jaipur. <ToConfirm>your story: who you are, where your spices come from, and why you started</ToConfirm>
      </p>
      <h2>What we sell</h2>
      <p>Whole spices, ground spices and masala blends for everyday Indian cooking, in pack sizes that suit your kitchen.</p>
      <h2>How we work</h2>
      <p>Clear prices with MRP and price per 100 g. Live courier rates and delivery estimates for your pincode, shown before you pay. Tracking from our door to yours.</p>
      <div className="mt-8">
        <LinkButton href="/shop">Shop our spices</LinkButton>
      </div>
    </ContentPage>
  );
}
