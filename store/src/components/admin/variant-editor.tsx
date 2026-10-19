"use client";

import { useState, useTransition } from "react";
import { saveVariantsAction, type CatalogResult } from "@/actions/admin/catalog";
import { Notice, cn } from "@/components/ui";

export type EditorVariant = {
  id?: number;
  optionValues: Record<string, string>;
  sku: string;
  price: string;
  mrp: string;
  netWeightGrams: number;
  shippingWeightGrams: number;
  hsnCode: string;
  gstRatePercent: number;
  isActive: boolean;
  shelfLifeOverride: string;
  pool?: { id: number; name: string; unit: "PACK" | "GRAM"; available: number };
  stockChoice: string; // "keep" | "new-pack" | "bulk:<id>"
  initialQty: number;
};

type Option = { name: string; valuesText: string };

function parseWeight(value: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(kg|g|gm|gram|grams)\b/i.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  return Math.round(m[2].toLowerCase() === "kg" ? n * 1000 : n);
}

function cartesian(options: { name: string; values: string[] }[]): Record<string, string>[] {
  return options.reduce<Record<string, string>[]>((acc, o) => acc.flatMap((combo) => o.values.map((v) => ({ ...combo, [o.name]: v }))), [{}]);
}

const key = (names: string[], values: Record<string, string>) => names.map((n) => values[n] ?? "").join("|");

export function VariantEditor(props: {
  productId: number;
  productCode: string;
  initialOptions: { name: string; values: string[] }[];
  initialVariants: EditorVariant[];
  bulkPools: { id: number; name: string; available: number }[];
}) {
  const [options, setOptions] = useState<Option[]>(props.initialOptions.length ? props.initialOptions.map((o) => ({ name: o.name, valuesText: o.values.join(", ") })) : [{ name: "Size", valuesText: "" }]);
  const [rows, setRows] = useState<EditorVariant[]>(props.initialVariants);
  const [result, setResult] = useState<CatalogResult>(null);
  const [pending, start] = useTransition();
  const parsed = options.map((o) => ({ name: o.name.trim(), values: [...new Set(o.valuesText.split(",").map((v) => v.trim()).filter(Boolean))] }));

  function regenerate() {
    const valid = parsed.filter((o) => o.name && o.values.length);
    const names = valid.map((o) => o.name);
    const byKey = new Map(rows.map((r) => [key(names, r.optionValues), r]));
    const template = rows[0];
    const next = cartesian(valid).map((combo): EditorVariant => {
      const existing = byKey.get(key(names, combo));
      if (existing) return { ...existing, optionValues: combo };
      const grams = parseWeight(Object.values(combo).join(" ")) ?? template?.netWeightGrams ?? 100;
      return {
        optionValues: combo,
        sku: `${props.productCode}-${Object.values(combo).map((v) => v.replace(/\s+/g, "").toUpperCase().slice(0, 6)).join("-")}`,
        price: "",
        mrp: "",
        netWeightGrams: grams,
        shippingWeightGrams: grams + 30,
        hsnCode: template?.hsnCode ?? "",
        gstRatePercent: template?.gstRatePercent ?? 5,
        isActive: true,
        shelfLifeOverride: "",
        stockChoice: template?.stockChoice.startsWith("bulk:") ? template.stockChoice : "new-pack",
        initialQty: 0,
      };
    });
    setRows(next);
    setResult(null);
  }

  function update(i: number, patch: Partial<EditorVariant>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function save() {
    const opts = parsed.filter((o) => o.name && o.values.length);
    const payload = {
      options: opts,
      variants: rows.map((r) => ({
        id: r.id,
        optionValues: r.optionValues,
        sku: r.sku,
        price: r.price,
        mrp: r.mrp,
        netWeightGrams: Number(r.netWeightGrams),
        shippingWeightGrams: Number(r.shippingWeightGrams),
        hsnCode: r.hsnCode,
        gstRatePercent: Number(r.gstRatePercent),
        isActive: r.isActive,
        shelfLifeOverride: r.shelfLifeOverride,
        stock: r.stockChoice.startsWith("bulk:")
          ? { kind: "bulk" as const, inventoryItemId: Number(r.stockChoice.slice(5)) }
          : r.stockChoice === "keep" && r.id
            ? { kind: "keep" as const }
            : { kind: "new-pack" as const, initialQty: Number(r.initialQty) || 0 },
      })),
    };
    start(async () => setResult(await saveVariantsAction(props.productId, payload)));
  }

  const names = parsed.map((o) => o.name);
  const optionsChanged = JSON.stringify(parsed.filter((o) => o.name && o.values.length)) !== JSON.stringify(props.initialOptions) && rows.some((r) => names.some((n) => !(n in r.optionValues)));
  const cell = "field px-2 py-1.5 text-sm";

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Options are how this product varies, e.g. <strong>Size</strong>: 100 g, 250 g, 500 g, or <strong>Form</strong>: Whole, Powder. Up to 3 options; each combination becomes a variant with its own price and stock.
        </p>
        {options.map((o, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label" htmlFor={`opt-name-${i}`}>
                Option {i + 1}
              </label>
              <input id={`opt-name-${i}`} className="field w-36 py-2" value={o.name} onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="e.g. Size" />
            </div>
            <div className="min-w-64 flex-1">
              <label className="label" htmlFor={`opt-values-${i}`}>
                Values, separated by commas
              </label>
              <input id={`opt-values-${i}`} className="field py-2" value={o.valuesText} onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? { ...x, valuesText: e.target.value } : x)))} placeholder="100 g, 250 g, 500 g" />
            </div>
            {options.length > 1 && (
              <button type="button" className="py-2 text-sm font-semibold text-chilli underline" onClick={() => setOptions((os) => os.filter((_, j) => j !== i))}>
                Remove
              </button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {options.length < 3 && (
            <button type="button" className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-forest" onClick={() => setOptions((os) => [...os, { name: "", valuesText: "" }])}>
              Add another option
            </button>
          )}
          <button type="button" className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest" onClick={regenerate}>
            Update variant list from options
          </button>
        </div>
        {optionsChanged && <Notice tone="warn">Options changed. Click &quot;Update variant list from options&quot; before saving.</Notice>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-line bg-ivory text-left text-xs text-muted">
              <th className="p-2">Variant</th>
              <th className="p-2">On sale</th>
              <th className="p-2">SKU</th>
              <th className="p-2">Price ₹ (incl. GST)</th>
              <th className="p-2">MRP ₹</th>
              <th className="p-2">Net g</th>
              <th className="p-2">Packed g</th>
              <th className="p-2">HSN</th>
              <th className="p-2">GST %</th>
              <th className="p-2">Stock comes from</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={r.id ?? `new-${key(names, r.optionValues)}`} className={cn(!r.isActive && "opacity-60")}>
                <td className="p-2 font-semibold whitespace-nowrap">{Object.values(r.optionValues).join(" · ") || "Standard"}</td>
                <td className="p-2 text-center">
                  <input type="checkbox" aria-label="On sale" checked={r.isActive} onChange={(e) => update(i, { isActive: e.target.checked })} className="size-4 accent-forest" />
                </td>
                <td className="p-2">
                  <input aria-label="SKU" className={cn(cell, "w-36 font-mono uppercase")} value={r.sku} onChange={(e) => update(i, { sku: e.target.value })} />
                </td>
                <td className="p-2">
                  <input aria-label="Price" className={cn(cell, "w-24")} inputMode="decimal" value={r.price} onChange={(e) => update(i, { price: e.target.value })} />
                </td>
                <td className="p-2">
                  <input aria-label="MRP" className={cn(cell, "w-24")} inputMode="decimal" value={r.mrp} onChange={(e) => update(i, { mrp: e.target.value })} />
                </td>
                <td className="p-2">
                  <input aria-label="Net weight in grams" className={cn(cell, "w-20")} inputMode="numeric" value={r.netWeightGrams} onChange={(e) => update(i, { netWeightGrams: Number(e.target.value.replace(/\D/g, "")) })} />
                </td>
                <td className="p-2">
                  <input aria-label="Packed weight in grams" className={cn(cell, "w-20")} inputMode="numeric" value={r.shippingWeightGrams} onChange={(e) => update(i, { shippingWeightGrams: Number(e.target.value.replace(/\D/g, "")) })} />
                </td>
                <td className="p-2">
                  <input aria-label="HSN code" className={cn(cell, "w-24")} inputMode="numeric" value={r.hsnCode} onChange={(e) => update(i, { hsnCode: e.target.value.replace(/\D/g, "") })} />
                </td>
                <td className="p-2">
                  <select aria-label="GST rate" className={cn(cell, "w-20")} value={r.gstRatePercent} onChange={(e) => update(i, { gstRatePercent: Number(e.target.value) })}>
                    {[0, 5, 12, 18, 28].map((g) => (
                      <option key={g} value={g}>
                        {g}%
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <select aria-label="Stock source" className={cn(cell, "w-56")} value={r.stockChoice} onChange={(e) => update(i, { stockChoice: e.target.value })}>
                      {r.id && r.pool && <option value="keep">{r.pool.unit === "GRAM" ? `Loose: ${r.pool.name}` : `Own packs (${r.pool.available} available)`}</option>}
                      <option value="new-pack">{r.id ? "Switch to new pack stock" : "Own packed stock"}</option>
                      {props.bulkPools
                        .filter((p) => !(r.pool?.unit === "GRAM" && r.pool.id === p.id && r.id))
                        .map((p) => (
                          <option key={p.id} value={`bulk:${p.id}`}>
                            Loose: {p.name} ({(p.available / 1000).toFixed(1)} kg)
                          </option>
                        ))}
                    </select>
                    {r.stockChoice === "new-pack" && (
                      <input aria-label="Opening stock (packs)" title="Opening stock (packs)" className={cn(cell, "w-20")} inputMode="numeric" value={r.initialQty} onChange={(e) => update(i, { initialQty: Number(e.target.value.replace(/\D/g, "")) })} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Net g is the weight printed on the pack (used for price per 100 g and loose-stock deduction). Packed g includes the pouch/jar, used for courier rates. Confirm HSN codes and GST rates with your CA. To create a loose-stock pool, go to Inventory.
      </p>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending || optionsChanged} className="rounded-full bg-forest px-6 py-2.5 font-semibold text-ivory disabled:opacity-50">
          {pending ? "Saving…" : "Save variants"}
        </button>
        {result && <span className={cn("text-sm font-semibold", result.ok ? "text-forest" : "text-chilli")}>{result.message}</span>}
      </div>
    </div>
  );
}
