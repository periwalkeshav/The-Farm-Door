import type { ReactNode } from "react";
import { Container } from "@/components/ui";

/** A visible placeholder for a business detail or decision the owner still has to confirm. */
export function ToConfirm({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-saffron/25 px-1 text-ink">[to confirm: {children}]</mark>;
}

export function ContentPage({ title, updated, children, draft = true }: { title: string; updated?: string; children: ReactNode; draft?: boolean }) {
  return (
    <Container className="max-w-3xl py-12">
      <h1 className="text-4xl sm:text-5xl">{title}</h1>
      {updated && <p className="mt-2 text-sm text-muted">Last updated: {updated}</p>}
      {draft && (
        <p className="mt-4 rounded-xl border border-saffron/40 bg-[#fdf3e1] px-4 py-3 text-sm text-[#6b4510]">
          Draft text prepared for The Farm Door. Highlighted items must be confirmed, and the whole page should be reviewed by a lawyer before launch.
        </p>
      )}
      <div className="prose-shop mt-8">{children}</div>
    </Container>
  );
}

export function businessLine(store: { legalName: string; tradeName: string; addressLine1: string; addressLine2: string; city: string; state: string; pincode: string }) {
  const address = [store.addressLine1, store.addressLine2, store.city, store.state, store.pincode].filter(Boolean).join(", ");
  return { name: store.legalName || store.tradeName, address };
}
