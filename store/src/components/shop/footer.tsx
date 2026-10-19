import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { Container } from "@/components/ui";
import { getCategories, getPublicSettings } from "@/data/catalog";
import { NewsletterForm } from "./newsletter-form";

export async function Footer() {
  "use cache";
  cacheTag("settings", "catalog");
  cacheLife("hours");
  const [{ store }, categories] = await Promise.all([getPublicSettings(), getCategories()]);
  const year = new Date().getFullYear();
  const linkClass = "text-ivory/75 hover:text-ivory";
  return (
    <footer className="mt-20 bg-forest text-ivory">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="font-display text-2xl font-semibold">The Farm Door</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ivory/75">Indian spices and pantry essentials, shipped from {store.city || "India"} to your door.</p>
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold">Get news and offers</p>
            <NewsletterForm tone="dark" />
          </div>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold tracking-wide text-saffron uppercase">Shop</p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link className={linkClass} href="/shop">
                All products
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link className={linkClass} href={`/category/${c.slug}`}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold tracking-wide text-saffron uppercase">Help</p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link className={linkClass} href="/track">
                Track your order
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/policies/shipping">
                Shipping &amp; delivery
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/policies/refunds">
                Cancellations &amp; refunds
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/faq">
                FAQ
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/contact">
                Contact us
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-bold tracking-wide text-saffron uppercase">About</p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link className={linkClass} href="/about">
                Our story
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/policies/privacy">
                Privacy policy
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/policies/terms">
                Terms of service
              </Link>
            </li>
          </ul>
          {(store.supportEmail || store.supportPhone) && (
            <div className="mt-5 space-y-1 text-sm text-ivory/75">
              {store.supportEmail && <p>{store.supportEmail}</p>}
              {store.supportPhone && <p>{store.supportPhone}</p>}
            </div>
          )}
        </div>
      </Container>
      <div className="border-t border-ivory/10">
        <Container className="flex flex-col gap-2 py-5 text-xs text-ivory/60 sm:flex-row sm:justify-between">
          <p>
            © {year} {store.legalName || store.tradeName}. All prices include GST.
          </p>
          <p className="flex flex-wrap gap-x-4">
            {store.fssaiNumber && <span>FSSAI Lic. No. {store.fssaiNumber}</span>}
            {store.gstin && <span>GSTIN {store.gstin}</span>}
          </p>
        </Container>
      </div>
    </footer>
  );
}
