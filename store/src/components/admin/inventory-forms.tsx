"use client";

import { useActionState, useState } from "react";
import { adjustStockAction, createPoolAction, updatePoolAction, type InventoryResult } from "@/actions/admin/inventory";
import { Field, FieldError, useForm } from "@/components/form";
import { cn } from "@/components/ui";
import { adjustStockSchema, newPoolSchema, poolSettingsSchema } from "@/lib/form-schemas";

function Result({ state, hidden }: { state: InventoryResult; hidden?: boolean }) {
  if (!state || hidden) return null;
  return <p className={cn("text-sm font-semibold", state.ok ? "text-forest" : "text-chilli")}>{state.message}</p>;
}

export function NewPoolForm() {
  const [state, action, pending] = useActionState<InventoryResult, FormData>(createPoolAction, null);
  const f = useForm({ schema: newPoolSchema, action, state });
  return (
    <form {...f.formProps} className="grid gap-3 sm:grid-cols-2 sm:items-start xl:grid-cols-[1.4fr_1fr_120px_120px_140px_auto]">
      <Field f={f} name="name" label="Name">
        <input {...f.field("name")} maxLength={120} placeholder="e.g. Coriander powder, loose" className="field py-2" />
      </Field>
      <Field f={f} name="sku" label="Code">
        <input {...f.field("sku")} maxLength={40} placeholder="CORI-PWD-BULK" className="field py-2 uppercase" />
      </Field>
      <Field f={f} name="openingKg" label="Opening kg">
        <input {...f.field("openingKg")} inputMode="decimal" maxLength={10} defaultValue="0" className="field py-2" />
      </Field>
      <Field f={f} name="thresholdKg" label="Alert below kg">
        <input {...f.field("thresholdKg")} inputMode="decimal" maxLength={10} defaultValue="1" className="field py-2" />
      </Field>
      <Field f={f} name="costPerKg" label="Cost ₹/kg" optional>
        <input {...f.field("costPerKg")} inputMode="decimal" maxLength={10} className="field py-2" />
      </Field>
      <button type="submit" disabled={pending} className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory disabled:opacity-60 xl:mt-7">
        {pending ? "Creating…" : "Create pool"}
      </button>
      <div className="sm:col-span-2 xl:col-span-6">
        <Result state={state} hidden={!!state?.fieldErrors} />
      </div>
    </form>
  );
}

export function AdjustStockForm({ poolId, unit }: { poolId: number; unit: "PACK" | "GRAM" }) {
  const [state, action, pending] = useActionState<InventoryResult, FormData>(adjustStockAction.bind(null, poolId), null);
  const f = useForm({ schema: adjustStockSchema, action, state, resetOnSuccess: true });
  const [kind, setKind] = useState<"RESTOCK" | "ADJUSTMENT">("RESTOCK");
  return (
    <form {...f.formProps} className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="kind" value="RESTOCK" checked={kind === "RESTOCK"} onChange={() => setKind("RESTOCK")} className="accent-forest" /> Goods received (restock)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="kind" value="ADJUSTMENT" checked={kind === "ADJUSTMENT"} onChange={() => setKind("ADJUSTMENT")} className="accent-forest" /> Correction (damage, recount…)
        </label>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        {kind === "ADJUSTMENT" && (
          <div>
            <label htmlFor={f.id("direction")} className="label">
              Direction
            </label>
            <select {...f.field("direction")} className="field w-auto py-2">
              <option value="remove">Remove</option>
              <option value="add">Add</option>
            </select>
          </div>
        )}
        <div>
          <label htmlFor={f.id("quantity")} className="label">
            Quantity
          </label>
          <input {...f.field("quantity")} inputMode="decimal" maxLength={10} className="field w-28 py-2" />
        </div>
        {unit === "GRAM" ? (
          <div>
            <label htmlFor={f.id("scale")} className="label">
              Unit
            </label>
            <select {...f.field("scale")} defaultValue="kg" className="field w-auto py-2">
              <option value="kg">kg</option>
              <option value="g">g</option>
            </select>
          </div>
        ) : (
          <span className="mt-9 text-sm text-muted">packs</span>
        )}
        <div className="min-w-56 flex-1">
          <label htmlFor={f.id("note")} className="label">
            Note {kind === "ADJUSTMENT" ? "" : <span className="font-normal text-muted">(optional)</span>}
          </label>
          <input {...f.field("note")} maxLength={300} placeholder={kind === "RESTOCK" ? "e.g. Batch from supplier, invoice no." : "e.g. 2 pouches torn"} className="field py-2" />
        </div>
        <button type="submit" disabled={pending} className="mt-7 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory disabled:opacity-60">
          {pending ? "Saving…" : "Update stock"}
        </button>
      </div>
      <FieldError f={f} name="quantity" />
      <FieldError f={f} name="note" />
      <Result state={state} hidden={!!state?.fieldErrors} />
    </form>
  );
}

export function PoolSettingsForm({ pool }: { pool: { id: number; name: string; unit: "PACK" | "GRAM"; lowStockThreshold: number; unitCostPaise: number | null; isActive: boolean } }) {
  const [state, action, pending] = useActionState<InventoryResult, FormData>(updatePoolAction.bind(null, pool.id), null);
  const f = useForm({ schema: poolSettingsSchema, action, state });
  const gram = pool.unit === "GRAM";
  return (
    <form {...f.formProps} className="grid gap-3 sm:grid-cols-2 sm:items-start">
      <Field f={f} name="name" label="Name" className="sm:col-span-2">
        <input {...f.field("name")} defaultValue={pool.name} maxLength={120} className="field py-2" />
      </Field>
      <Field f={f} name="threshold" label={`Low-stock alert ${gram ? "(kg)" : "(packs)"}`}>
        <input {...f.field("threshold")} inputMode="decimal" maxLength={10} defaultValue={gram ? pool.lowStockThreshold / 1000 : pool.lowStockThreshold} className="field py-2" />
        {gram && <input type="hidden" name="thresholdScale" value="kg" />}
      </Field>
      <Field f={f} name="cost" label={`Cost ₹ ${gram ? "per kg" : "per pack"}`} optional>
        <input {...f.field("cost")} inputMode="decimal" maxLength={10} defaultValue={pool.unitCostPaise === null ? "" : (pool.unitCostPaise / 100).toString()} className="field py-2" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={pool.isActive} className="accent-forest" /> Available for sale
      </label>
      <button type="submit" disabled={pending} className="justify-self-start rounded-full border border-forest px-5 py-2 text-sm font-semibold text-forest disabled:opacity-60 sm:justify-self-end">
        {pending ? "Saving…" : "Save"}
      </button>
      <div className="sm:col-span-2">
        <Result state={state} hidden={!!state?.fieldErrors} />
      </div>
    </form>
  );
}
