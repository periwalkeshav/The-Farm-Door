"use client";

import { useActionState, useState, useTransition } from "react";
import { endSaleAction, saveSaleAction, type SaleResult } from "@/actions/admin/sales";
import { Field, FieldError, useForm } from "@/components/form";
import { saleFormSchema } from "@/lib/form-schemas";

export type SaleValues = {
  id: number | null;
  name: string;
  percent: string;
  startsAt: string;
  endsAt: string;
  scope: "ALL" | "PRODUCTS" | "CATEGORIES";
  productIds: number[];
  categoryIds: number[];
  isActive: boolean;
};

export function SaleForm({ sale, products, categories, onDone }: { sale: SaleValues; products: { id: number; name: string }[]; categories: { id: number; name: string }[]; onDone?: () => void }) {
  const [state, action, pending] = useActionState<SaleResult, FormData>(saveSaleAction.bind(null, sale.id), null);
  const f = useForm({ schema: saleFormSchema, action, state, resetOnSuccess: !sale.id });
  const [scope, setScope] = useState(sale.scope);
  const hasFieldErrors = Object.keys(f.errors).length > 0;
  return (
    <form {...f.formProps} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Field f={f} name="name" label="Name (customers see this)" className="md:col-span-2">
          <input {...f.field("name")} defaultValue={sale.name} maxLength={40} className="field" placeholder="Diwali sale" />
        </Field>
        <Field f={f} name="percent" label="Percent off" hint="1 to 90, off the normal selling price">
          <input {...f.field("percent", { hint: true })} defaultValue={sale.percent} inputMode="numeric" maxLength={2} className="field" placeholder="15" />
        </Field>
        <div />
        <Field f={f} name="startsAt" label="Starts (India time)">
          <input {...f.field("startsAt")} type="datetime-local" defaultValue={sale.startsAt} className="field" />
        </Field>
        <Field f={f} name="endsAt" label="Ends (India time)">
          <input {...f.field("endsAt")} type="datetime-local" defaultValue={sale.endsAt} className="field" />
        </Field>
      </div>
      <fieldset>
        <legend className="label">Applies to</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {(["ALL", "CATEGORIES", "PRODUCTS"] as const).map((s) => (
            <label key={s} className="flex items-center gap-2">
              <input type="radio" name="scope" value={s} checked={scope === s} onChange={() => setScope(s)} className="accent-forest" />
              {s === "ALL" ? "Everything" : s === "PRODUCTS" ? "Selected products" : "Selected categories"}
            </label>
          ))}
        </div>
        {scope === "PRODUCTS" && (
          <div className="mt-3 grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-line p-3 text-sm sm:grid-cols-2">
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-2">
                <input type="checkbox" name="productIds" value={p.id} defaultChecked={sale.productIds.includes(p.id)} className="accent-forest" /> {p.name}
              </label>
            ))}
          </div>
        )}
        {scope === "CATEGORIES" && (
          <div className="mt-3 flex flex-wrap gap-4 rounded-xl border border-line p-3 text-sm">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2">
                <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={sale.categoryIds.includes(c.id)} className="accent-forest" /> {c.name}
              </label>
            ))}
          </div>
        )}
        <FieldError f={f} name="productIds" />
        <FieldError f={f} name="categoryIds" />
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={sale.isActive} className="size-4 accent-forest" /> On (untick to pause without deleting)
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-forest px-6 py-2.5 font-semibold text-ivory disabled:opacity-60">
          {pending ? "Saving…" : sale.id ? "Save sale" : "Schedule sale"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm font-semibold text-muted underline">
            Close
          </button>
        )}
        {hasFieldErrors ? (
          <span className="text-sm font-semibold text-chilli">Please fix the highlighted fields.</span>
        ) : (
          state && (
            <span role="status" className={`text-sm font-semibold ${state.ok ? "text-forest" : "text-chilli"}`}>
              {state.message}
            </span>
          )
        )}
      </div>
    </form>
  );
}

export function SaleRowActions({ sale, products, categories, canEnd }: { sale: SaleValues; products: { id: number; name: string }[]; categories: { id: number; name: string }[]; canEnd: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setEditing(!editing)} aria-expanded={editing} className="rounded-full border border-forest px-3 py-1 text-xs font-semibold text-forest">
          Edit
        </button>
        {canEnd && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm(`End "${sale.name}" now? Prices go back to normal straight away.`)) start(async () => void (await endSaleAction(sale.id!)));
            }}
            className="rounded-full border border-chilli/40 px-3 py-1 text-xs font-semibold text-chilli disabled:opacity-60"
          >
            {pending ? "Ending…" : "End now"}
          </button>
        )}
      </div>
      {editing && (
        <div className="mt-4 rounded-xl border border-line p-4">
          <SaleForm sale={sale} products={products} categories={categories} onDone={() => setEditing(false)} />
        </div>
      )}
    </div>
  );
}
