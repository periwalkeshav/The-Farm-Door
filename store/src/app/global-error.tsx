"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/error-reporter";

/** Last-resort error page (when even the main layout fails). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F7F2E8", color: "#27231F", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ color: "#1F3B2D" }}>Something went wrong</h1>
          <p>Please try again in a moment. If you were paying, payments are only confirmed after we verify them.</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, padding: "10px 20px", borderRadius: 999, border: 0, background: "#1F3B2D", color: "#F7F2E8", fontWeight: 600 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
