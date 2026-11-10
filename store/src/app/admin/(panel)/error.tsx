"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/error-reporter";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError(error);
  }, [error]);
  return (
    <div className="max-w-lg py-10">
      <h1 className="text-2xl">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">The error has been recorded under Site errors. Try again, or reload the page.</p>
      {error.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
      <button type="button" onClick={reset} className="mt-5 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory">
        Try again
      </button>
    </div>
  );
}
