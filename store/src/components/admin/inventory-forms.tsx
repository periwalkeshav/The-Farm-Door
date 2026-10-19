"use client";

import { useActionState, useState } from "react";
import { adjustStockAction, createPoolAction, updatePoolAction, type InventoryResult } from "@/actions/admin/inventory";
import { cn } from "@/components/ui";

function Result({ state }: { state: InventoryResult }) {
  if (!state) return null;
  return <p className={cn("text-sm font-semibold", state.ok ? "text-forest" : "text-chilli")}>{state.message}</p>;
}

export function NewPoolForm() {
  const [state, action, pending] = useActionState<InventoryResult, FormData>(createPoolAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 sm:items-end xl:grid-cols-[1.4fr_1fr_120px_120px_140px_auto]">
      <div>
        <label htmlFor="pool-name" className="label">
          Name
        </label>
        <input id="pool-name" name="name" required placeholder="e.g. Coriander powder, loose" className="field py-2" />
      </div>
      <div>
        <label htmlFor="pool-sku" className="label">
          Code
        </label>
        <input id="pool-sku" name="sku" required placeholder="CORI-PWD-BULK" className="field py-2 uppercase" />
      </div>
      <div>
        <label htmlFor="pool-open" className="label">
          Opening kg
        </label>
        <input id="pool-open" name="openingKg" inputMode="decimal" defaultValue="0" className="field py-2" />
      </div>
      <div>
        <label htmlFor="pool-alert" className="label">
          Alert below kg
        </label>
        <input id="pool-alert" name="thresholdKg" inputMode="decimal" defaultValue="1" className="field py-2" />
      </div>
      <div>
        <label htmlFor="pool-cost" className="label">
          Cost ₹/kg (optional)
        </label>
        <input id="pool-cost" name="costPerKg" inputMode="decimal" className="field py-2" />
      </div>
      <button type="submit" disabled={pending} className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory disabled:opacity-60">
        {pending ? "Creating…" : "Create pool"}
      </button>
      <div className="sm:col-span-2 xl:col-span-6">
        <Result state={state} />
      </div>
    </form>
  );
}

export function AdjustStockForm({ poolId, unit }: { poolId: number; unit: "PACK" | "GRAM" }) {
  const [state, action, pending] = useActionState<InventoryResult, FormData>(adjustStockAction.bind(null, poolId), null);
  const [kind, setKind] = useState<"RESTOCK" | "ADJUSTMENT">("RESTOCK");
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="kind" value="RESTOCK" checked={kind === "RESTOCK"} onChange={() => setKind("RESTOCK")} className="accent-forest" /> Goods received (restock)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="kind" value="ADJUSTMENT" checked={kind === "ADJUSTMENT"} onChange={() => setKind("ADJUSTMENT")} className="accent-forest" /> Correction (damage, recount…)
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {kind === "ADJUSTMENT" && (
          <div>
            <label htmlFor="adj-dir" className="label">
              Direction
            </label>
            <select id="adj-dir" name="direction" className="field w-auto py-2">
              <option value="remove">Remove</option>
              <option value="add">Add</option>
            </select>
          </div>
        )}
        <div>
          <label htmlFor="adj-qty" className="label">
            Quantity
          </label>
          <input id="adj-qty" name="quantity" inputMode="decimal" required className="field w-28 py-2" />
        </div>
        {unit === "GRAM" ? (
          <div>
            <label htmlFor="adj-scale" className="label">
              Unit
            </label>
            <select id="adj-scale" name="scale" defaultValue="kg" className="field w-auto py-2">
              <option value="kg">kg</option>
              <option value="g">g</option>
            </select>
          </div>
        ) : (
          <span className="pb-2.5 text-sm text-muted">packs</span>
        )}
        <div className="min-w-56 flex-1">
          <label htmlFor="adj-note" className="label">
            Note {kind === "ADJUSTMENT" ? "" : "(optional)"}
          </label>
          <input id="adj-note" name="note" maxLength={300} placeholder={kind === "RESTOCK" ? "e.g. Batch from supplier, invoice no." : "e.g. 2 pouches torn"} className="field py-2" />
        </div>
        <button type="submit" disabled={pending} className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory disabled:opacity-60">
          {pending ? "Saving…" : "Update stock"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function PoolSettingsForm({ pool }: { pool: { id: number; name: string; unit: "PACK" | "GRAM"; lowStockThreshold: number; unitCostPaise: number | null; isActive: boolean } }) {
  const [state, action, pending] = useActionState<InventoryResult, FormData>(updatePoolAction.bind(null, pool.id), null);
  const gram = pool.unit === "GRAM";
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 sm:items-end">
      <div className="sm:col-span-2">
        <label htmlFor="ps-name" className="label">
          Name
        </label>
        <input id="ps-name" name="name" defaultValue={pool.name} className="field py-2" />
      </div>
      <div>
        <label htmlFor="ps-threshold" className="label">
          Low-stock alert {gram ? "(kg)" : "(packs)"}
        </label>
        <input id="ps-threshold" name="threshold" inputMode="decimal" defaultValue={gram ? pool.lowStockThreshold / 1000 : pool.lowStockThreshold} className="field py-2" />
        {gram && <input type="hidden" name="thresholdScale" value="kg" />}
      </div>
      <div>
        <label htmlFor="ps-cost" className="label">
          Cost ₹ {gram ? "per kg" : "per pack"}
        </label>
        <input id="ps-cost" name="cost" inputMode="decimal" defaultValue={pool.unitCostPaise === null ? "" : (pool.unitCostPaise / 100).toString()} className="field py-2" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={pool.isActive} className="accent-forest" /> Available for sale
      </label>
      <button type="submit" disabled={pending} className="justify-self-start rounded-full border border-forest px-5 py-2 text-sm font-semibold text-forest disabled:opacity-60 sm:justify-self-end">
        Save
      </button>
      <div className="sm:col-span-2">
        <Result state={state} />
      </div>
    </form>
  );
}
