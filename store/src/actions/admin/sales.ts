"use server";

import { refresh, updateTag } from "next/cache";
import { getDb } from "@/db";
import { PermissionError, requireStaffAction } from "@/data/session";
import { istDateTime, saleFormSchema } from "@/lib/form-schemas";
import { fieldErrorsFrom, formValues, type FieldErrors } from "@/lib/validation";
import { endSale, SaleError, saveSale } from "@/server/sales";

export type SaleResult = { ok: boolean; message: string; fieldErrors?: FieldErrors } | null;

export async function saveSaleAction(saleId: number | null, _prev: SaleResult, formData: FormData): Promise<SaleResult> {
  const staff = await requireStaffAction("coupons.manage");
  const parsed = saleFormSchema.safeParse(formValues(formData));
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const d = parsed.data;
  try {
    await saveSale(
      getDb(),
      saleId,
      { name: d.name, percentOffBp: d.percent * 100, scope: d.scope, productIds: d.productIds, categoryIds: d.categoryIds, startsAt: istDateTime(d.startsAt)!, endsAt: istDateTime(d.endsAt)!, isActive: d.isActive },
      staff.id,
    );
  } catch (err) {
    if (err instanceof SaleError || err instanceof PermissionError) return { ok: false, message: err.message };
    throw err;
  }
  // Prices on shop pages change straight away for a sale that's already running.
  updateTag("catalog");
  refresh();
  return { ok: true, message: saleId ? "Sale saved." : "Sale scheduled." };
}

export async function endSaleAction(saleId: number): Promise<SaleResult> {
  const staff = await requireStaffAction("coupons.manage");
  await endSale(getDb(), saleId, staff.id);
  updateTag("catalog");
  refresh();
  return { ok: true, message: "Sale ended." };
}
