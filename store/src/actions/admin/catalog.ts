"use server";

import { eq } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { categories, collections, productImages } from "@/db/schema";
import { requireStaffAction } from "@/data/session";
import { logAudit } from "@/server/audit";
import { groupFormSchema, newProductSchema, productDetailsSchema } from "@/lib/form-schemas";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/validation";
import { CatalogError, createProduct, deleteProduct, moveImage, saveVariants, slugify, updateProductDetails, variantsPayloadSchema } from "@/server/catalog/admin";
import { MediaError, saveImage } from "@/server/media";

export type CatalogResult = { ok: boolean; message: string; fieldErrors?: FieldErrors } | null;

function invalidate(...slugs: (string | undefined)[]) {
  updateTag("catalog");
  updateTag("stock");
  for (const s of slugs) if (s) updateTag(`product:${s}`);
}

export async function createProductAction(_prev: CatalogResult, formData: FormData): Promise<CatalogResult> {
  const staff = await requireStaffAction("products.manage");
  const parsed = newProductSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const categoryId = Number(formData.get("categoryId")) || null;
  const p = await createProduct(getDb(), { name: parsed.data.name, categoryId }, staff.id);
  redirect(`/admin/products/${p.id}`);
}

export async function updateProductAction(productId: number, _prev: CatalogResult, formData: FormData): Promise<CatalogResult> {
  const staff = await requireStaffAction("products.manage");
  const parsed = productDetailsSchema.safeParse({
    ...Object.fromEntries(formData),
    categoryId: formData.get("categoryId") || null,
    isFeatured: formData.get("isFeatured") === "on",
    collectionIds: formData.getAll("collectionIds"),
  });
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const r = await updateProductDetails(getDb(), productId, parsed.data, staff.id);
    invalidate(r.slug, r.previousSlug);
    refresh();
    return { ok: true, message: "Saved." };
  } catch (err) {
    if (err instanceof CatalogError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function saveVariantsAction(productId: number, payload: unknown): Promise<CatalogResult> {
  const staff = await requireStaffAction("products.manage");
  const parsed = variantsPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    const r = await saveVariants(getDb(), productId, parsed.data, staff.id);
    invalidate(r.slug);
    refresh();
    return { ok: true, message: "Variants saved." };
  } catch (err) {
    if (err instanceof CatalogError) return { ok: false, message: err.message };
    if (err instanceof Error && /unique/i.test(err.message)) return { ok: false, message: "That SKU is already in use." };
    throw err;
  }
}

export async function deleteProductAction(productId: number): Promise<CatalogResult> {
  const staff = await requireStaffAction("products.manage");
  try {
    const p = await deleteProduct(getDb(), productId, staff.id);
    invalidate(p.slug);
  } catch (err) {
    if (err instanceof CatalogError) return { ok: false, message: err.message };
    throw err;
  }
  redirect("/admin/products");
}

export async function uploadImagesAction(productId: number, _prev: CatalogResult, formData: FormData): Promise<CatalogResult> {
  const staff = await requireStaffAction("products.manage");
  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, message: "Choose one or more images." };
  const db = getDb();
  const existing = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, productId));
  try {
    let order = existing.length;
    for (const file of files.slice(0, 10)) {
      const mediaId = await saveImage(db, Buffer.from(await file.arrayBuffer()), file.type, String(formData.get("alt") ?? ""));
      await db.insert(productImages).values({ productId, mediaId, alt: String(formData.get("alt") ?? "").slice(0, 200), sortOrder: order++ });
    }
    await logAudit(db, { staffUserId: staff.id, action: "product.images_upload", entityType: "product", entityId: productId, data: { count: files.length } });
  } catch (err) {
    if (err instanceof MediaError) return { ok: false, message: err.message };
    throw err;
  }
  invalidate();
  refresh();
  return { ok: true, message: `${files.length} image${files.length === 1 ? "" : "s"} added.` };
}

export async function deleteImageAction(imageId: number) {
  await requireStaffAction("products.manage");
  await getDb().delete(productImages).where(eq(productImages.id, imageId));
  invalidate();
  refresh();
}

export async function moveImageAction(imageId: number, direction: -1 | 1) {
  await requireStaffAction("products.manage");
  await moveImage(getDb(), imageId, direction);
  invalidate();
  refresh();
}

export async function updateImageAltAction(imageId: number, alt: string) {
  await requireStaffAction("products.manage");
  await getDb().update(productImages).set({ alt: alt.slice(0, 200) }).where(eq(productImages.id, imageId));
  invalidate();
  refresh();
}

/* ---------------- Categories & collections ---------------- */

const groupSchema = groupFormSchema.extend({
  id: z.coerce.number().int().positive().optional(),
  isActive: z.boolean(),
  showOnHome: z.boolean().default(false),
  showInShopBy: z.boolean().default(false),
});

export async function saveGroupAction(kind: "category" | "collection", _prev: CatalogResult, formData: FormData): Promise<CatalogResult> {
  const staff = await requireStaffAction("products.manage");
  const parsed = groupSchema.safeParse({
    ...Object.fromEntries(formData),
    id: formData.get("id") || undefined,
    isActive: formData.get("isActive") === "on",
    showOnHome: formData.get("showOnHome") === "on",
    showInShopBy: formData.get("showInShopBy") === "on",
  });
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const d = parsed.data;
  const table = kind === "category" ? categories : collections;
  const values = { name: d.name, slug: slugify(d.slug || d.name), description: d.description, nameHi: d.nameHi, descriptionHi: d.descriptionHi, sortOrder: d.sortOrder ?? 0, isActive: d.isActive, ...(kind === "collection" ? { showOnHome: d.showOnHome, showInShopBy: d.showInShopBy, categoryId: d.categoryId ?? null } : {}) };
  try {
    const db = getDb();
    if (d.id) await db.update(table).set(values).where(eq(table.id, d.id));
    else await db.insert(table).values(values);
    await logAudit(db, { staffUserId: staff.id, action: `${kind}.save`, entityType: kind, entityId: d.id ?? "", data: { name: d.name } });
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) return { ok: false, message: "That web address is already used.", fieldErrors: { slug: "That web address is already used. Choose another." } };
    throw err;
  }
  updateTag("catalog");
  refresh();
  return { ok: true, message: "Saved." };
}
