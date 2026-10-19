import { Footer } from "@/components/shop/footer";
import { Header } from "@/components/shop/header";
import { testModeReasons } from "@/lib/env";

function TestModeBanner() {
  const reasons = testModeReasons();
  if (!reasons.length) return null;
  return (
    <div className="bg-chilli px-4 py-1.5 text-center text-xs font-semibold text-white" role="note">
      TEST MODE: {reasons.join(", ")}. No real orders, payments or deliveries.
    </div>
  );
}

export default function ShopLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <TestModeBanner />
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
