"use client";

import { useState, useTransition } from "react";
import { assembleAction, saveRecipeAction, type KitResult } from "@/actions/admin/kits";
import { cn, Notice } from "@/components/ui";

type Pool = { id: number; name: string; unit: "PACK" | "GRAM" };
type Line = { componentItemId: number; quantity: string };

export function RecipeEditor({ kitItemId, initial, pools }: { kitItemId: number; initial: { componentItemId: number; quantity: number }[]; pools: Pool[] }) {
  const [lines, setLines] = useState<Line[]>(initial.length ? initial.map((l) => ({ componentItemId: l.componentItemId, quantity: String(l.quantity) })) : [{ componentItemId: 0, quantity: "1" }]);
  const [result, setResult] = useState<KitResult>(null);
  const [problems, setProblems] = useState<Record<number, string>>({});
  const [pending, start] = useTransition();
  const unitOf = (id: number) => pools.find((p) => p.id === id)?.unit;
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function save() {
    const found: Record<number, string> = {};
    const used = new Set<number>();
    lines.forEach((l, i) => {
      if (!l.componentItemId) found[i] = "Choose an item.";
      else if (used.has(l.componentItemId)) found[i] = "Already in the box. Change the quantity on the first line instead.";
      else if (!/^\d+$/.test(l.quantity) || Number(l.quantity) <= 0) found[i] = unitOf(l.componentItemId) === "GRAM" ? "Enter grams, e.g. 50." : "Enter how many packs, e.g. 1.";
      used.add(l.componentItemId);
    });
    setProblems(found);
    if (Object.keys(found).length) return;
    start(async () => setResult(await saveRecipeAction(kitItemId, lines.map((l) => ({ componentItemId: l.componentItemId, quantity: Number(l.quantity) })))));
  }

  return (
    <div className="space-y-3">
      {lines.map((l, i) => (
        <div key={i}>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`kit-item-${i}`}>
              Item
            </label>
            <select id={`kit-item-${i}`} value={l.componentItemId} onChange={(e) => update(i, { componentItemId: Number(e.target.value) })} aria-invalid={problems[i] ? true : undefined} className="field min-w-56 flex-1 py-2 text-sm">
              <option value={0}>Choose an item…</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.unit === "GRAM" ? "(loose, grams)" : "(packs)"}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`kit-qty-${i}`}>
              Quantity
            </label>
            <input id={`kit-qty-${i}`} value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" aria-invalid={problems[i] ? true : undefined} className="field w-24 py-2 text-sm" />
            <span className="w-12 text-sm text-muted">{unitOf(l.componentItemId) === "GRAM" ? "g" : "packs"}</span>
            <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-sm font-semibold text-muted underline hover:text-chilli">
              Remove
            </button>
          </div>
          {problems[i] && <p className="mt-1 text-sm font-semibold text-chilli">{problems[i]}</p>}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setLines((ls) => [...ls, { componentItemId: 0, quantity: "1" }])} className="text-sm font-semibold text-forest underline">
          + Add an item
        </button>
        <button type="button" disabled={pending} onClick={save} className="rounded-full bg-forest px-5 py-2 text-sm font-semibold text-ivory disabled:opacity-60">
          {pending ? "Saving…" : "Save contents"}
        </button>
      </div>
      {result && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
    </div>
  );
}

export function AssembleForm({ kitItemId, hasRecipe }: { kitItemId: number; hasRecipe: boolean }) {
  const [count, setCount] = useState("");
  const [result, setResult] = useState<KitResult>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (mode: "assemble" | "disassemble") => {
    const n = Number(count);
    if (!/^\d+$/.test(count) || n <= 0) return setProblem("Enter how many boxes, e.g. 20.");
    setProblem(null);
    if (mode === "disassemble" && !window.confirm(`Take apart ${n} box${n === 1 ? "" : "es"} and put the contents back in stock?`)) return;
    start(async () => setResult(await assembleAction(kitItemId, mode, n)));
  };
  if (!hasRecipe) return <p className="text-sm text-muted">Save what goes in the box first.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="kit-count" className="text-sm font-semibold text-forest">
          Boxes
        </label>
        <input id="kit-count" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="20" aria-invalid={problem ? true : undefined} className={cn("field w-24 py-2")} />
        <button type="button" disabled={pending} onClick={() => run("assemble")} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-ivory disabled:opacity-60">
          Make up boxes
        </button>
        <button type="button" disabled={pending} onClick={() => run("disassemble")} className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest disabled:opacity-60">
          Take apart
        </button>
      </div>
      {problem && <p className="text-sm font-semibold text-chilli">{problem}</p>}
      {result && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
      <p className="text-xs text-muted">Making up boxes takes their contents out of stock and adds boxes you can sell. Every change appears in the stock history.</p>
    </div>
  );
}
