"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { requireStaffAction } from "@/data/session";
import { assembleKits, disassembleKits, KitError, saveRecipe } from "@/server/kits";

export type KitResult = { ok: boolean; message: string } | null;

const lineSchema = z.array(z.object({ componentItemId: z.number().int().positive(), quantity: z.number().int() })).max(30);

export async function saveRecipeAction(kitItemId: number, lines: unknown): Promise<KitResult> {
  const staff = await requireStaffAction("inventory.manage");
  const parsed = lineSchema.safeParse(lines);
  if (!parsed.success) return { ok: false, message: "Check each line has an item and a quantity." };
  try {
    await saveRecipe(getDb(), kitItemId, parsed.data, staff.id);
  } catch (err) {
    if (err instanceof KitError) return { ok: false, message: err.message };
    throw err;
  }
  updateTag("catalog");
  refresh();
  return { ok: true, message: "Box contents saved." };
}

export async function assembleAction(kitItemId: number, mode: "assemble" | "disassemble", count: number): Promise<KitResult> {
  const staff = await requireStaffAction("inventory.manage");
  try {
    const n = mode === "assemble" ? await assembleKits(getDb(), kitItemId, count, staff.id) : await disassembleKits(getDb(), kitItemId, count, staff.id);
    updateTag("stock");
    refresh();
    return { ok: true, message: mode === "assemble" ? `Made up ${n} box${n === 1 ? "" : "es"}. Their contents were taken out of stock.` : `Took apart ${n} box${n === 1 ? "" : "es"}. The contents are back in stock.` };
  } catch (err) {
    if (err instanceof KitError) return { ok: false, message: err.message };
    if (err instanceof Error && /held for unpaid orders/.test(err.message)) return { ok: false, message: err.message };
    throw err;
  }
}
