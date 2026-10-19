import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-ivory px-6 text-center">
      <div>
        <Link href="/" aria-label="The Farm Door home">
          <Logo />
        </Link>
        <h1 className="mt-8 text-4xl">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-muted">It may have moved, or the link may be mistyped.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/shop" className="rounded-full bg-forest px-5 py-2.5 font-semibold text-ivory">
            Shop spices
          </Link>
          <Link href="/track" className="rounded-full border border-forest px-5 py-2.5 font-semibold text-forest">
            Track an order
          </Link>
        </div>
      </div>
    </main>
  );
}
