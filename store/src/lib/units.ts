/** "3 packs", "750 g", "2.5 kg" */
export function formatUnits(units: number, unit: "PACK" | "GRAM") {
  if (unit === "PACK") return `${units} pack${units === 1 ? "" : "s"}`;
  return Math.abs(units) >= 1000 ? `${(units / 1000).toFixed(2).replace(/\.?0+$/, "")} kg` : `${units} g`;
}
