"use client";

import { useEffect } from "react";

/** Sends a browser error to the server's error log. Quietly does nothing if that fails. */
export function reportClientError(error: { message?: string; digest?: string; stack?: string }) {
  try {
    const body = JSON.stringify({ message: String(error.message ?? "Unknown error").slice(0, 1000), digest: error.digest, path: location.pathname, stack: error.stack?.slice(0, 4000) });
    if (!navigator.sendBeacon?.("/api/client-errors", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/client-errors", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
    }
  } catch {
    // ignore
  }
}

/** Catches script errors outside React error boundaries (e.g. in click handlers), at most 5 per page. */
export function ErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const send = (message: string, stack?: string, source?: string) => {
      // Ignore noise from browser extensions and cross-origin scripts.
      if (sent >= 5 || !message || message === "Script error." || /ResizeObserver loop/.test(message)) return;
      if (source && !source.startsWith(location.origin)) return;
      sent++;
      reportClientError({ message, stack });
    };
    const onError = (e: ErrorEvent) => send(e.message, e.error instanceof Error ? e.error.stack : undefined, e.filename);
    const onRejection = (e: PromiseRejectionEvent) => send(e.reason instanceof Error ? e.reason.message : String(e.reason), e.reason instanceof Error ? e.reason.stack : undefined);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
