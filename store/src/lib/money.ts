/** Money helpers. All amounts are integer paise. */

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const inrExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,299 or ₹1,299.50 — drops ".00" for whole rupees. */
export function formatINR(paise: number): string {
  return inr.format(paise / 100);
}

/** Always two decimals, for invoices and reports: ₹1,299.00 */
export function formatINRExact(paise: number): string {
  return inrExact.format(paise / 100);
}

/** Rupees (as typed in admin forms, e.g. "249.50") to paise. Returns null when invalid. */
export function rupeesToPaise(input: string | number): number | null {
  const text = String(input).trim().replace(/[,₹\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function paiseToRupeesString(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, "0")}`;
}

/** Price per 100 g in paise, rounded to the nearest paisa. */
export function pricePer100g(pricePaise: number, netWeightGrams: number): number | null {
  if (!netWeightGrams || netWeightGrams <= 0) return null;
  return Math.round((pricePaise * 100) / netWeightGrams);
}

/** Whole-number discount percentage from MRP, rounded down so we never overstate it. */
export function discountPercent(pricePaise: number, mrpPaise: number): number {
  if (mrpPaise <= 0 || pricePaise >= mrpPaise) return 0;
  return Math.floor(((mrpPaise - pricePaise) * 100) / mrpPaise);
}

/** Rounds a paise amount up to the next whole rupee. */
export function ceilToRupee(paise: number): number {
  return Math.ceil(paise / 100) * 100;
}

/** "250 g", "1 kg", "1.5 kg" */
export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000;
    return `${Number.isInteger(kg) ? kg : kg.toFixed(2).replace(/0+$/, "")} kg`;
  }
  return `${grams} g`;
}
