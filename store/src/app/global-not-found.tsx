import type { Metadata } from "next";
import Link from "next/link";
import { RootHtml } from "@/components/root-html";
import { Logo } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found · The Farm Door" };

/** For addresses that match nothing at all (shop pages have their own, inside the shop layout). */
export default function GlobalNotFound() {
  return (
    <RootHtml lang="en-IN">
      <main className="grid min-h-dvh place-items-center bg-ivory px-6 text-center">
        <div>
          <Link href="/" aria-label="The Farm Door home">
            <Logo />
          </Link>
          <h1 className="mt-8 text-4xl">We couldn&apos;t find that page</h1>
          <p className="mt-2 text-muted">It may have moved, or the link may be mistyped.</p>
          <Link href="/shop" className="mt-6 inline-block rounded-full bg-forest px-5 py-2.5 font-semibold text-ivory">
            Shop spices
          </Link>
        </div>
      </main>
    </RootHtml>
  );
}
