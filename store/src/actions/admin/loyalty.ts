"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db";
import { requireStaffAction } from "@/data/session";
import { pointsAdjustSchema } from "@/lib/form-schemas";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/validation";
import { logAudit } from "@/server/audit";
import { adjustPoints, PointsChangedError } from "@/server/loyalty";

export type PointsResult = { ok: boolean; message: string; fieldErrors?: FieldErrors } | null;

export async function adjustPointsAction(customerId: number, _prev: PointsResult, formData: FormData): Promise<PointsResult> {
  const staff = await requireStaffAction("settings.manage");
  const parsed = pointsAdjustSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const db = getDb();
  try {
    await adjustPoints(db, customerId, parsed.data.points, parsed.data.note, staff.id);
  } catch (err) {
    if (err instanceof PointsChangedError) return { ok: false, message: err.message, fieldErrors: { points: err.message } };
    throw err;
  }
  await logAudit(db, { staffUserId: staff.id, action: "loyalty.adjust", entityType: "customer", entityId: customerId, data: parsed.data });
  refresh();
  return { ok: true, message: `${parsed.data.points > 0 ? "Added" : "Removed"} ${Math.abs(parsed.data.points)} points.` };
}
