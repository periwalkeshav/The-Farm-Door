import Link from "next/link";
import { Logo } from "@/components/ui";

/** An admin address that doesn't exist (or an order, product… that has gone). */
export default function AdminNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <Logo />
        <h1 className="mt-8 text-3xl">Not found</h1>
        <p className="mt-2 text-muted">This page doesn&apos;t exist, or what it showed has been removed.</p>
        <Link href="/admin" className="mt-6 inline-block rounded-full bg-forest px-5 py-2.5 font-semibold text-ivory">
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
