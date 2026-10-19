import { addDays, istToday, rangeFromDates, type Range } from "./reports";

export const PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "mtd", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "fytd", label: "This financial year" },
] as const;

export type ResolvedRange = { key: string; label: string; fromDate: string; toDate: string; range: Range; unit: "day" | "week" | "month" };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Resolves ?range=…&from=…&to=… (IST dates) into a concrete range. Defaults to the last 30 days. */
export function resolveRange(sp: Record<string, string | string[] | undefined>, now = new Date()): ResolvedRange {
  const today = istToday(now);
  const key = typeof sp.range === "string" ? sp.range : "30d";
  let fromDate: string;
  let toDate = today;
  let label: string = PRESETS.find((p) => p.key === key)?.label ?? "Last 30 days";
  switch (key) {
    case "today":
      fromDate = today;
      break;
    case "7d":
      fromDate = addDays(today, -6);
      break;
    case "90d":
      fromDate = addDays(today, -89);
      break;
    case "mtd":
      fromDate = `${today.slice(0, 8)}01`;
      break;
    case "lastmonth": {
      const firstThis = `${today.slice(0, 8)}01`;
      toDate = addDays(firstThis, -1);
      fromDate = `${toDate.slice(0, 8)}01`;
      break;
    }
    case "fytd": {
      const y = Number(today.slice(0, 4));
      const m = Number(today.slice(5, 7));
      fromDate = `${m >= 4 ? y : y - 1}-04-01`;
      break;
    }
    case "custom":
      if (isDate(sp.from) && isDate(sp.to) && sp.from <= sp.to) {
        fromDate = sp.from;
        toDate = sp.to > today ? today : sp.to;
        label = `${fromDate} to ${toDate}`;
        break;
      }
    // falls through to the default when the custom dates are invalid
    default:
      fromDate = addDays(today, -29);
      label = "Last 30 days";
  }
  const days = Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000) + 1;
  return { key, label, fromDate, toDate, range: rangeFromDates(fromDate, toDate), unit: days > 120 ? "month" : days > 45 ? "week" : "day" };
}
