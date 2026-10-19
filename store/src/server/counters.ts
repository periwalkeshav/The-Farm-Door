import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { financialYear, financialYearShort } from "@/lib/india";

/** Atomically increments and returns a named counter (gap-free within a committed transaction). */
export async function nextCounter(tx: DbOrTx, key: string, start = 1): Promise<number> {
  const result = await tx.execute<{ value: number }>(sql`
    insert into counters (key, value) values (${key}, ${start})
    on conflict (key) do update set value = counters.value + 1
    returning value
  `);
  return Number(result.rows[0].value);
}

/** Customer-facing order numbers: numeric (couriers prefer digits), e.g. 100001. */
export async function nextOrderNumber(tx: DbOrTx): Promise<string> {
  return String(await nextCounter(tx, "order", 100001));
}

/** GST invoice number, one series per financial year, ≤16 characters: TFD/26-27/00001 */
export async function nextInvoiceNumber(tx: DbOrTx, date: Date) {
  const fy = financialYear(date);
  const n = await nextCounter(tx, `invoice:${fy}`);
  return { number: `TFD/${financialYearShort(date)}/${String(n).padStart(5, "0")}`, financialYear: fy };
}

export async function nextCreditNoteNumber(tx: DbOrTx, date: Date) {
  const fy = financialYear(date);
  const n = await nextCounter(tx, `credit-note:${fy}`);
  return { number: `CN/${financialYearShort(date)}/${String(n).padStart(5, "0")}`, financialYear: fy };
}
