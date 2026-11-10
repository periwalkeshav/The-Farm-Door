"use client";

import { useState, useTransition } from "react";
import { saveVariantsAction, type CatalogResult } from "@/actions/admin/catalog";
import { Notice, cn } from "@/components/ui";
import { rupeesToPaise } from "@/lib/money";

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

/** The net quantity in an option value: "250 g", "1 kg" for weight; "500 ml", "1 L", "5 Ltr" for volume. */
function parseQuantity(value: string, unit: "g" | "ml"): number | null {
  const m = unit === "ml" ? /(\d+(?:\.\d+)?)\s*(ml|l|ltr|litre|liter|litres|liters)\b/i.exec(value) : /(\d+(?:\.\d+)?)\s*(kg|g|gm|gram|grams)\b/i.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  const big = unit === "ml" ? !/^ml$/i.test(m[2]) : /^kg$/i.test(m[2]);
  return Math.round(big ? n * 1000 : n);
}

function cartesian(options: { name: string; values: string[] }[]): Record<string, string>[] {
  return options.reduce<Record<string, string>[]>((acc, o) => acc.flatMap((combo) => o.values.map((v) => ({ ...combo, [o.name]: v }))), [{}]);
}

const key = (names: string[], values: Record<string, string>) => names.map((n) => values[n] ?? "").join("|");

type Cell = "sku" | "price" | "mrp" | "netWeightGrams" | "shippingWeightGrams" | "hsnCode" | "initialQty";

/** The same rules the server applies, checked per cell so each problem can be highlighted. */
function findProblems(options: { name: string; values: string[] }[], rows: EditorVariant[], unit: "g" | "ml") {
  const general: string[] = [];
  const cells: Partial<Record<Cell, string>>[] = rows.map(() => ({}));
  const named = options.filter((o) => o.name);
  if (new Set(named.map((o) => o.name.toLowerCase())).size !== named.length) general.push("Option names must be different.");
  for (const o of named) if (!o.values.length) general.push(`Add at least one value for “${o.name}”.`);
  const skuCount = new Map<string, number>();
  for (const r of rows) skuCount.set(r.sku.trim().toUpperCase(), (skuCount.get(r.sku.trim().toUpperCase()) ?? 0) + 1);
  rows.forEach((r, i) => {
    const c = cells[i];
    const sku = r.sku.trim();
    if (!sku) c.sku = "Enter a SKU.";
    else if (!/^[A-Za-z0-9._-]{2,40}$/.test(sku)) c.sku = "2–40 letters, numbers, dot, dash or underscore.";
    else if ((skuCount.get(sku.toUpperCase()) ?? 0) > 1) c.sku = "Each variant needs a different SKU.";
    const price = rupeesToPaise(r.price);
    const mrp = rupeesToPaise(r.mrp);
    if (!r.price.trim()) c.price = "Enter the selling price.";
    else if (price === null || price <= 0) c.price = "Enter a price in rupees, like 249 or 249.50.";
    if (!r.mrp.trim()) c.mrp = "Enter the MRP.";
    else if (mrp === null) c.mrp = "Enter the MRP in rupees.";
    else if (price !== null && mrp < price) c.mrp = "MRP can't be less than the selling price.";
    if (!r.netWeightGrams || r.netWeightGrams > 100_000) c.netWeightGrams = unit === "ml" ? "Enter the net volume in ml (1–100000)." : "Enter the net weight in grams (1–100000).";
    if (!r.shippingWeightGrams || r.shippingWeightGrams > 100_000) c.shippingWeightGrams = "Enter the packed weight in grams.";
    // (Only comparable for weights: a litre of oil weighs less than 1000 g.)
    else if (unit === "g" && r.netWeightGrams && r.shippingWeightGrams < r.netWeightGrams) c.shippingWeightGrams = "Packed weight can't be less than the net weight.";
    if (!/^\d{4,8}$/.test(r.hsnCode)) c.hsnCode = "HSN code is 4–8 digits.";
    if (r.stockChoice === "new-pack" && r.initialQty > 100_000) c.initialQty = "Opening stock can't exceed 100000 packs.";
  });
  const labels: Record<Cell, string> = { sku: "SKU", price: "Price", mrp: "MRP", netWeightGrams: `Net ${unit}`, shippingWeightGrams: "Packed g", hsnCode: "HSN", initialQty: "Opening stock" };
  const list = [...general];
  rows.forEach((r, i) => {
    for (const [k, msg] of Object.entries(cells[i])) list.push(`${Object.values(r.optionValues).join(" · ") || "Standard"} · ${labels[k as Cell]}: ${msg}`);
  });
  return { cells, list };
}

export function VariantEditor(props: {
  productId: number;
  productCode: string;
  initialOptions: { name: string; values: string[] }[];
  initialVariants: EditorVariant[];
  bulkPools: { id: number; name: string; available: number }[];
  /** "ml" when the product is sold by volume (set under Details › Sold by). */
  netUnit: "g" | "ml";
}) {
  const unit = props.netUnit;
  const [options, setOptions] = useState<Option[]>(props.initialOptions.length ? props.initialOptions.map((o) => ({ name: o.name, valuesText: o.values.join(", ") })) : [{ name: "Size", valuesText: "" }]);
  const [rows, setRows] = useState<EditorVariant[]>(props.initialVariants);
  const [result, setResult] = useState<CatalogResult>(null);
  const [pending, start] = useTransition();
  // Problems are shown after the first save attempt, then update as cells are fixed.
  const [checked, setChecked] = useState(false);
  const parsed = options.map((o) => ({ name: o.name.trim(), values: [...new Set(o.valuesText.split(",").map((v) => v.trim()).filter(Boolean))] }));

  function regenerate() {
    const valid = parsed.filter((o) => o.name && o.values.length);
    const names = valid.map((o) => o.name);
    const byKey = new Map(rows.map((r) => [key(names, r.optionValues), r]));
    const template = rows[0];
    const next = cartesian(valid).map((combo): EditorVariant => {
      const existing = byKey.get(key(names, combo));
      if (existing) return { ...existing, optionValues: combo };
      const grams = parseQuantity(Object.values(combo).join(" "), unit) ?? template?.netWeightGrams ?? 100;
      return {
        optionValues: combo,
        sku: `${props.productCode}-${Object.values(combo).map((v) => v.replace(/\s+/g, "").toUpperCase().slice(0, 6)).join("-")}`,
        price: "",
        mrp: "",
        netWeightGrams: grams,
        // A starting guess for the packed weight: liquids are a little lighter than water, plus a bottle.
        shippingWeightGrams: unit === "ml" ? Math.round(grams * 0.92) + 250 : grams + 30,
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
    setChecked(true);
    if (findProblems(parsed, rows, unit).list.length) {
      setResult(null);
      return;
    }
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
  const problems = checked ? findProblems(parsed, rows, unit) : { cells: rows.map(() => ({})) as Partial<Record<Cell, string>>[], list: [] as string[] };
  const bad = (i: number, c: Cell) => {
    const msg = problems.cells[i]?.[c];
    return msg ? { "aria-invalid": true as const, title: msg } : {};
  };

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
              <th className="p-2">Net {unit}</th>
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
                  <input aria-label="SKU" {...bad(i, "sku")} maxLength={40} className={cn(cell, "w-36 font-mono uppercase")} value={r.sku} onChange={(e) => update(i, { sku: e.target.value })} />
                </td>
                <td className="p-2">
                  <input aria-label="Price" {...bad(i, "price")} maxLength={10} className={cn(cell, "w-24")} inputMode="decimal" value={r.price} onChange={(e) => update(i, { price: e.target.value })} />
                </td>
                <td className="p-2">
                  <input aria-label="MRP" {...bad(i, "mrp")} maxLength={10} className={cn(cell, "w-24")} inputMode="decimal" value={r.mrp} onChange={(e) => update(i, { mrp: e.target.value })} />
                </td>
                <td className="p-2">
                  <input aria-label={unit === "ml" ? "Net volume in ml" : "Net weight in grams"} {...bad(i, "netWeightGrams")} maxLength={6} className={cn(cell, "w-20")} inputMode="numeric" value={r.netWeightGrams} onChange={(e) => update(i, { netWeightGrams: Number(e.target.value.replace(/\D/g, "")) })} />
                </td>
                <td className="p-2">
                  <input aria-label="Packed weight in grams" {...bad(i, "shippingWeightGrams")} maxLength={6} className={cn(cell, "w-20")} inputMode="numeric" value={r.shippingWeightGrams} onChange={(e) => update(i, { shippingWeightGrams: Number(e.target.value.replace(/\D/g, "")) })} />
                </td>
                <td className="p-2">
                  <input aria-label="HSN code" {...bad(i, "hsnCode")} maxLength={8} className={cn(cell, "w-24")} inputMode="numeric" value={r.hsnCode} onChange={(e) => update(i, { hsnCode: e.target.value.replace(/\D/g, "") })} />
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
                      <input aria-label="Opening stock (packs)" title="Opening stock (packs)" {...bad(i, "initialQty")} maxLength={6} className={cn(cell, "w-20")} inputMode="numeric" value={r.initialQty} onChange={(e) => update(i, { initialQty: Number(e.target.value.replace(/\D/g, "")) })} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        {unit === "ml" ? "Net ml is the volume printed on the bottle or tin (used for price per 100 ml)." : "Net g is the weight printed on the pack (used for price per 100 g and loose-stock deduction)."} Packed g is the weight of the whole pack, including the pouch, jar, bottle or tin, used for courier rates. Products sold by volume are set under Details › Sold by. Confirm HSN codes and GST rates with your CA. To create a loose-stock pool, go to Inventory.
      </p>
      {problems.list.length > 0 && (
        <Notice tone="error">
          <p className="font-semibold">
            Fix {problems.list.length === 1 ? "this problem" : `these ${problems.list.length} problems`} before saving (highlighted in the table):
          </p>
          <ul className="mt-1 list-disc pl-5">
            {problems.list.slice(0, 8).map((p) => (
              <li key={p}>{p}</li>
            ))}
            {problems.list.length > 8 && <li>…and {problems.list.length - 8} more</li>}
          </ul>
        </Notice>
      )}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending || optionsChanged} className="rounded-full bg-forest px-6 py-2.5 font-semibold text-ivory disabled:opacity-50">
          {pending ? "Saving…" : "Save variants"}
        </button>
        {result && <span className={cn("text-sm font-semibold", result.ok ? "text-forest" : "text-chilli")}>{result.message}</span>}
      </div>
    </div>
  );
}
