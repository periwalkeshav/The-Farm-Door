"use client";

import { useState, useTransition } from "react";
import { combinedLabelAction, packOrdersAction, type BulkPackResult } from "@/actions/admin/orders";
import { Notice } from "@/components/ui";

/** Order checkboxes live in the table and belong to this form through form="bulk-orders". */
const FORM_ID = "bulk-orders";

function selectedIds(): number[] {
  const form = document.getElementById(FORM_ID) as HTMLFormElement | null;
  return form ? new FormData(form).getAll("ids").map(Number) : [];
}

export function SelectAllOrders() {
  return (
    <input
      type="checkbox"
      aria-label="Select all orders on this page"
      className="size-4 accent-forest"
      onChange={(e) => {
        for (const box of document.querySelectorAll<HTMLInputElement>(`input[form="${FORM_ID}"][name="ids"]`)) box.checked = e.target.checked;
      }}
    />
  );
}

export function SelectOrder({ id, orderNumber }: { id: number; orderNumber: string }) {
  return <input type="checkbox" form={FORM_ID} name="ids" value={id} aria-label={`Select order ${orderNumber}`} className="size-4 accent-forest" />;
}

export function BulkOrderActions() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [results, setResults] = useState<BulkPackResult | null>(null);

  function need(): number[] | null {
    const ids = selectedIds();
    if (!ids.length) {
      setMessage({ tone: "error", text: "Tick the orders first." });
      return null;
    }
    setMessage(null);
    setResults(null);
    return ids;
  }

  return (
    <form id={FORM_ID} onSubmit={(e) => e.preventDefault()} className="mb-4 space-y-3 rounded-2xl border border-line bg-paper p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="mr-1 font-semibold text-forest">With ticked orders:</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const ids = need();
            if (!ids || !window.confirm(`Pack and book a courier for ${ids.length} order${ids.length === 1 ? "" : "s"}? Each booking is charged to your courier account.`)) return;
            start(async () => {
              const r = await packOrdersAction(ids);
              if ("error" in r) setMessage({ tone: "error", text: r.error });
              else setResults(r.results);
            });
          }}
          className="rounded-full bg-forest px-4 py-2 font-semibold text-ivory disabled:opacity-60"
        >
          {pending ? "Working…" : "Pack & book courier"}
        </button>
        <button
          type="button"
          onClick={() => {
            const ids = need();
            if (ids) window.open(`/admin/packing-slips?ids=${ids.join(",")}`, "_blank", "noopener");
          }}
          className="rounded-full border border-forest px-4 py-2 font-semibold text-forest"
        >
          Print packing slips
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const ids = need();
            if (!ids) return;
            start(async () => {
              const r = await combinedLabelAction(ids);
              if ("error" in r) setMessage({ tone: "error", text: r.error });
              else {
                window.open(r.url, "_blank", "noopener");
                setMessage({ tone: "success", text: "Labels opened in a new tab." });
              }
            });
          }}
          className="rounded-full border border-forest px-4 py-2 font-semibold text-forest disabled:opacity-60"
        >
          Shipping labels (PDF)
        </button>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {results && (
        <Notice tone={results.every((r) => r.ok) ? "success" : "info"}>
          <ul className="space-y-0.5">
            {results.map((r) => (
              <li key={r.orderNumber}>
                <strong>#{r.orderNumber}</strong>: <span className={r.ok ? "" : "text-chilli"}>{r.message}</span>
              </li>
            ))}
          </ul>
        </Notice>
      )}
    </form>
  );
}
