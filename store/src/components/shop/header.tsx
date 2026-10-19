import Link from "next/link";
import { Suspense } from "react";
import { Container, Logo } from "@/components/ui";
import { getCartCount } from "@/data/cart";
import { getCategories, getPublicSettings } from "@/data/catalog";
import { getCustomer } from "@/data/session";
import { formatINR } from "@/lib/money";
import { MobileMenu } from "./mobile-menu";

async function AnnouncementBar() {
  "use cache";
  const { shipping, cod } = await getPublicSettings();
  const parts = ["Delivering across India"];
  if (shipping.freeShippingThresholdPaise !== null) parts.unshift(`Free shipping on orders over ${formatINR(shipping.freeShippingThresholdPaise)}`);
  if (cod.enabled) parts.push("Cash on delivery available");
  return (
    <div className="bg-forest text-center text-xs font-semibold tracking-wide text-ivory">
      <Container className="py-2">{parts.join("  ·  ")}</Container>
    </div>
  );
}

async function CartLink() {
  const count = await getCartCount();
  return (
    <Link href="/cart" className="relative grid size-10 place-items-center rounded-full text-forest hover:bg-forest/5" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}>
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </svg>
      {count > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-saffron px-1 text-[11px] font-bold text-forest-deep">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}

async function AccountLink() {
  const customer = await getCustomer();
  return (
    <Link href={customer ? "/account" : "/login"} className="grid size-10 place-items-center rounded-full text-forest hover:bg-forest/5" aria-label={customer ? "Your account" : "Sign in"}>
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5" />
      </svg>
    </Link>
  );
}

const IconPlaceholder = () => <span className="size-10" />;

export async function Header() {
  const categories = await getCategories();
  const links = [{ href: "/shop", label: "Shop all" }, ...categories.map((c) => ({ href: `/category/${c.slug}`, label: c.name })), { href: "/track", label: "Track order" }];
  return (
    <header className="sticky top-0 z-40">
      <AnnouncementBar />
      <div className="border-b border-line bg-ivory/90 backdrop-blur supports-[backdrop-filter]:bg-ivory/75">
        <Container className="flex h-16 items-center gap-3">
          <MobileMenu links={links} />
          <Link href="/" aria-label="The Farm Door home" className="shrink-0">
            <Logo />
          </Link>
          <nav aria-label="Main" className="ml-6 hidden items-center gap-1 xl:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap text-forest/85 hover:bg-forest/5 hover:text-forest">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <form action="/shop" role="search" className="mr-1 hidden md:block">
              <label htmlFor="header-search" className="sr-only">
                Search spices
              </label>
              <input id="header-search" name="q" type="search" placeholder="Search spices" className="w-44 rounded-full border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-forest focus:ring-4 focus:ring-saffron/25 lg:w-52" />
            </form>
            <Link href="/shop?focus=search" className="grid size-10 place-items-center rounded-full text-forest hover:bg-forest/5 md:hidden" aria-label="Search">
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m20 20-4.2-4.2" />
              </svg>
            </Link>
            <Suspense fallback={<IconPlaceholder />}>
              <AccountLink />
            </Suspense>
            <Suspense fallback={<IconPlaceholder />}>
              <CartLink />
            </Suspense>
          </div>
        </Container>
      </div>
    </header>
  );
}
