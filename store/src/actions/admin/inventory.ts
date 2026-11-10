"use server";

import { eq } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { inventoryItems } from "@/db/schema";
import { requireStaffAction } from "@/data/session";
import { adjustStockSchema, newPoolSchema, poolSettingsSchema } from "@/lib/form-schemas";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/validation";
import { logAudit } from "@/server/audit";
import { adjustStock } from "@/server/inventory";

export type InventoryResult = { ok: boolean; message: string; fieldErrors?: FieldErrors } | null;

/** Quantity typed in admin → pool units (grams for loose stock, packs otherwise). */
function toUnits(qty: string, unit: "PACK" | "GRAM", scale: string): number | null {
  const n = Number(qty.trim());
  if (!Number.isFinite(n)) return null;
  const value = unit === "GRAM" && scale === "kg" ? n * 1000 : n;
  return Number.isInteger(Math.round(value * 1000) / 1000) ? Math.round(value) : null;
}

export async function createPoolAction(_prev: InventoryResult, formData: FormData): Promise<InventoryResult> {
  const staff = await requireStaffAction("inventory.manage");
  const parsed = newPoolSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const d = { ...parsed.data, openingKg: parsed.data.openingKg ?? 0, thresholdKg: parsed.data.thresholdKg ?? 0 };
  const cost = d.costPerKg;
  const db = getDb();
  let id: number;
  try {
    id = await db.transaction(async (tx) => {
      const [pool] = await tx
        .insert(inventoryItems)
        .values({ name: d.name, sku: d.sku, unit: "GRAM", onHand: 0, lowStockThreshold: Math.round(d.thresholdKg * 1000), unitCostPaise: cost })
        .returning({ id: inventoryItems.id });
      const grams = Math.round(d.openingKg * 1000);
      if (grams > 0) await adjustStock(tx, pool.id, grams, { reason: "RESTOCK", staffUserId: staff.id, note: "Opening stock" });
      await logAudit(tx, { staffUserId: staff.id, action: "inventory.create_pool", entityType: "inventory", entityId: pool.id, data: { name: d.name } });
      return pool.id;
    });
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) return { ok: false, message: "That code is already used by another stock pool.", fieldErrors: { sku: "That code is already used by another stock pool." } };
    throw err;
  }
  redirect(`/admin/inventory/${id}`);
}

export async function updatePoolAction(poolId: number, _prev: InventoryResult, formData: FormData): Promise<InventoryResult> {
  const staff = await requireStaffAction("inventory.manage");
  const db = getDb();
  const [pool] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, poolId));
  if (!pool) return { ok: false, message: "Stock pool not found." };
  const parsed = poolSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { name, cost } = parsed.data;
  const threshold = toUnits(String(parsed.data.threshold ?? 0), pool.unit, String(formData.get("thresholdScale") ?? "g"));
  if (threshold === null) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: { threshold: pool.unit === "PACK" ? "Enter a whole number of packs." : "Use at most 3 decimal places (grams)." } };
  await db
    .update(inventoryItems)
    .set({ name, lowStockThreshold: threshold, unitCostPaise: cost, isActive: formData.get("isActive") === "on" })
    .where(eq(inventoryItems.id, poolId));
  await logAudit(db, { staffUserId: staff.id, action: "inventory.update_pool", entityType: "inventory", entityId: poolId, data: { name, threshold, cost } });
  updateTag("stock");
  refresh();
  return { ok: true, message: "Saved." };
}

export async function adjustStockAction(poolId: number, _prev: InventoryResult, formData: FormData): Promise<InventoryResult> {
  const staff = await requireStaffAction("inventory.manage");
  const db = getDb();
  const [pool] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, poolId));
  if (!pool) return { ok: false, message: "Stock pool not found." };
  const parsed = adjustStockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { kind, note } = parsed.data;
  const direction = formData.get("direction") === "remove" ? -1 : 1;
  const units = toUnits(String(parsed.data.quantity), pool.unit, String(formData.get("scale") ?? "g"));
  if (units === null || units <= 0) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: { quantity: pool.unit === "PACK" ? "Enter a whole number of packs." : "Enter a quantity greater than zero." } };
  const delta = kind === "RESTOCK" ? units : direction * units;
  try {
    await db.transaction(async (tx) => {
      await adjustStock(tx, poolId, delta, { reason: kind, staffUserId: staff.id, note: note || "Restock" });
      await logAudit(tx, { staffUserId: staff.id, action: "inventory.adjust", entityType: "inventory", entityId: poolId, data: { delta, kind, note } });
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't change stock." };
  }
  updateTag("stock");
  refresh();
  const shown = pool.unit === "GRAM" ? `${(Math.abs(delta) / 1000).toFixed(3).replace(/\.?0+$/, "")} kg` : `${Math.abs(delta)} pack${Math.abs(delta) === 1 ? "" : "s"}`;
  return { ok: true, message: `${delta > 0 ? "Added" : "Removed"} ${shown}.` };
}
