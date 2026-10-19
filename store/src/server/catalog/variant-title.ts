import type { ProductOption } from "@/db/schema";

/** "Powder · Hot · 250 g", in the order the product lists its options. */
export function variantTitle(options: ProductOption[], values: Record<string, string>): string {
  const ordered = options.map((o) => values[o.name]).filter(Boolean);
  const extras = Object.entries(values)
    .filter(([name]) => !options.some((o) => o.name === name))
    .map(([, v]) => v);
  return [...ordered, ...extras].join(" · ") || "Standard";
}
