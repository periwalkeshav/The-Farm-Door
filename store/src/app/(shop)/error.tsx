"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ShopError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <h1 className="text-3xl">Something went wrong</h1>
      <p className="mt-2 text-muted">Please try again. If you were paying, don&apos;t worry: payments are only confirmed after we verify them, and any money taken for an unconfirmed order is refunded automatically.</p>
      {error.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-full bg-forest px-5 py-2.5 font-semibold text-ivory">
          Try again
        </button>
        <Link href="/" className="rounded-full border border-forest px-5 py-2.5 font-semibold text-forest">
          Home
        </Link>
      </div>
    </div>
  );
}
