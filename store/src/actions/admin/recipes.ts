"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireStaffAction } from "@/data/session";
import { recipeSchema } from "@/lib/form-schemas";
import { fieldErrorsFrom, formValues, type FieldErrors } from "@/lib/validation";
import { logAudit } from "@/server/audit";
import { MediaError, saveImage } from "@/server/media";
import { RecipeError, saveRecipe } from "@/server/recipes";

export type RecipeResult = { ok: boolean; message: string; fieldErrors?: FieldErrors } | null;

export async function saveRecipeAction(id: number | null, _prev: RecipeResult, formData: FormData): Promise<RecipeResult> {
  const staff = await requireStaffAction("products.manage");
  const parsed = recipeSchema.safeParse(formValues(formData));
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const db = getDb();
  let imageId: number | null | undefined;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    try {
      imageId = await saveImage(db, Buffer.from(await file.arrayBuffer()), file.type, parsed.data.title);
    } catch (err) {
      if (err instanceof MediaError) return { ok: false, message: err.message, fieldErrors: { image: err.message } };
      throw err;
    }
  } else if (formData.get("removeImage") === "on") imageId = null;
  let row;
  try {
    row = await saveRecipe(db, id, parsed.data, imageId);
  } catch (err) {
    if (err instanceof RecipeError) return { ok: false, message: err.message };
    throw err;
  }
  await logAudit(db, { staffUserId: staff.id, action: id ? "recipe.update" : "recipe.create", entityType: "recipe", entityId: row.id, data: { status: row.status } });
  updateTag("recipes");
  if (!id) redirect(`/admin/recipes/${row.id}?created=1`);
  refresh();
  return { ok: true, message: row.status === "PUBLISHED" ? "Saved and published." : "Saved as a draft." };
}
