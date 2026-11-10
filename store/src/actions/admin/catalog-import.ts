"use server";

import { refresh, updateTag } from "next/cache";
import { getDb } from "@/db";
import { requireStaffAction } from "@/data/session";
import { applyCatalogImport, planCatalogImport, type ImportResult, type RowError } from "@/server/catalog/import";

export type ImportPreview = {
  ok: boolean;
  message: string;
  rowCount?: number;
  products?: { handle: string; name: string; isNew: boolean; created: number; updated: number; unchanged: number }[];
  errors?: RowError[];
  warnings?: string[];
  results?: ImportResult[];
};

async function readCsv(formData: FormData): Promise<string | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the CSV file to import." };
  if (file.size > 3_000_000) return { error: "That file is too large (3 MB maximum)." };
  if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") return { error: "Save the spreadsheet as CSV (File › Download/Save as › CSV) and upload that." };
  return file.text();
}

/** Step 1: check the file and show what would change. Nothing is saved. */
export async function previewCatalogImportAction(_prev: ImportPreview | null, formData: FormData): Promise<ImportPreview> {
  await requireStaffAction("products.manage");
  const text = await readCsv(formData);
  if (typeof text !== "string") return { ok: false, message: text.error };
  const plan = await planCatalogImport(getDb(), text);
  return {
    ok: plan.errors.length === 0 && plan.products.length > 0,
    message: plan.errors.length ? `Found ${plan.errors.length} problem${plan.errors.length === 1 ? "" : "s"}. Fix them in your spreadsheet and check again; nothing has been changed.` : plan.products.length ? "Ready to import. Nothing has been changed yet." : "No products found in the file.",
    rowCount: plan.rowCount,
    products: plan.products.map((p) => ({ handle: p.handle, name: p.name, isNew: !p.productId, ...p.counts })),
    errors: plan.errors.slice(0, 200),
    warnings: plan.warnings,
  };
}

/** Step 2: import the same file (checked again on the server). */
export async function applyCatalogImportAction(_prev: ImportPreview | null, formData: FormData): Promise<ImportPreview> {
  const staff = await requireStaffAction("products.manage");
  const text = await readCsv(formData);
  if (typeof text !== "string") return { ok: false, message: text.error };
  const db = getDb();
  const plan = await planCatalogImport(db, text);
  if (plan.errors.length) return { ok: false, message: "The file has problems; check it again.", errors: plan.errors.slice(0, 200), warnings: plan.warnings };
  const results = await applyCatalogImport(db, plan, staff.id);
  updateTag("catalog");
  updateTag("stock");
  refresh();
  const failed = results.filter((r) => !r.ok).length;
  return {
    ok: failed === 0,
    message: failed ? `Imported ${results.length - failed} of ${results.length} products. See the problems below.` : `Imported ${results.length} product${results.length === 1 ? "" : "s"}. New products are drafts unless the file says Active.`,
    results,
  };
}
