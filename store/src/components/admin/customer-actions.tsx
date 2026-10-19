"use client";

import { useState, useTransition } from "react";
import { anonymiseCustomerAction } from "@/actions/admin/customers";
import { Notice } from "@/components/ui";

export function AnonymiseButton({ customerId }: { customerId: number }) {
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  if (result?.ok) return <Notice tone="success">{result.message}</Notice>;
  return (
    <div className="space-y-2">
      {!confirm ? (
        <button type="button" onClick={() => setConfirm(true)} className="rounded-full border border-chilli/40 px-4 py-2 text-sm font-semibold text-chilli">
          Delete this customer&apos;s personal data…
        </button>
      ) : (
        <div className="rounded-xl border border-chilli/30 p-4 text-sm">
          <p>Removes name, email, phone, saved addresses, sign-in sessions and newsletter consent. Past orders and invoices stay (unlinked) for tax records. This can&apos;t be undone.</p>
          <div className="mt-3 flex gap-3">
            <button type="button" disabled={pending} onClick={() => start(async () => setResult(await anonymiseCustomerAction(customerId)))} className="rounded-full bg-chilli px-4 py-2 font-semibold text-white disabled:opacity-60">
              {pending ? "Deleting…" : "Delete personal data"}
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="font-semibold text-muted underline">
              Cancel
            </button>
          </div>
        </div>
      )}
      {result && !result.ok && <Notice tone="error">{result.message}</Notice>}
    </div>
  );
}
