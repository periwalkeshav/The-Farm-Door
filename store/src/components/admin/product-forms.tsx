"use client";

import { useActionState, useTransition, useState } from "react";
import {
  createProductAction,
  deleteImageAction,
  deleteProductAction,
  moveImageAction,
  saveGroupAction,
  updateImageAltAction,
  updateProductAction,
  uploadImagesAction,
  type CatalogResult,
} from "@/actions/admin/catalog";
import { Field, FieldError, useForm } from "@/components/form";
import { Notice } from "@/components/ui";
import { groupFormSchema, imageUploadSchema, newProductSchema, productDetailsSchema } from "@/lib/form-schemas";
import { mediaUrl } from "@/lib/media-url";

type Cat = { id: number; name: string };

export function NewProductForm({ categories }: { categories: Cat[] }) {
  const [state, action, pending] = useActionState<CatalogResult, FormData>(createProductAction, null);
  const f = useForm({ schema: newProductSchema, action, state });
  return (
    <form {...f.formProps} className="flex flex-wrap items-start gap-3">
      <Field f={f} name="name" label="New product name">
        <input {...f.field("name")} maxLength={120} className="field w-64 py-2" placeholder="e.g. Kasuri Methi" />
      </Field>
      <div>
        <label htmlFor={f.id("categoryId")} className="label">
          Category
        </label>
        <select {...f.field("categoryId")} className="field w-auto py-2">
          <option value="">None</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className="mt-7 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory disabled:opacity-60">
        {pending ? "Creating…" : "Create draft"}
      </button>
      {state && !state.ok && !state.fieldErrors && <p className="w-full text-sm text-chilli">{state.message}</p>}
    </form>
  );
}

type Details = {
  name: string;
  slug: string;
  subtitle: string;
  description: string;
  categoryId: number | null;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  netUnit: "g" | "ml";
  tags: string[];
  ingredients: string;
  usageInstructions: string;
  storageInstructions: string;
  shelfLife: string;
  countryOfOrigin: string;
  allergenInfo: string;
  nutritionInfo: string;
  isFeatured: boolean;
  seoTitle: string;
  seoDescription: string;
  nameHi: string;
  subtitleHi: string;
  descriptionHi: string;
  ingredientsHi: string;
  usageInstructionsHi: string;
  storageInstructionsHi: string;
};

const HINDI_FIELDS = ["nameHi", "subtitleHi", "descriptionHi", "ingredientsHi", "usageInstructionsHi", "storageInstructionsHi"] as const;

export function ProductDetailsForm({ productId, details, categories, collections, memberOf }: { productId: number; details: Details; categories: Cat[]; collections: Cat[]; memberOf: number[] }) {
  const [state, action, pending] = useActionState<CatalogResult, FormData>(updateProductAction.bind(null, productId), null);
  const f = useForm({ schema: productDetailsSchema, action, state });
  const text = (name: keyof Details, label: string, opts: { rows?: number; hint?: string; max?: number; lang?: string } = {}) => (
    <Field f={f} name={name} label={label} hint={opts.hint} optional={!!opts.lang}>
      {opts.rows ? (
        <textarea {...f.field(name, { hint: !!opts.hint })} rows={opts.rows} defaultValue={String(details[name] ?? "")} maxLength={opts.max} lang={opts.lang} className="field" />
      ) : (
        <input {...f.field(name, { hint: !!opts.hint })} defaultValue={String(details[name] ?? "")} maxLength={opts.max} lang={opts.lang} className="field" />
      )}
    </Field>
  );
  const hindiCount = HINDI_FIELDS.filter((n) => details[n]).length;
  const hasFieldErrors = Object.keys(f.errors).length > 0;
  return (
    <form {...f.formProps} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {text("name", "Name", { max: 120 })}
        {text("subtitle", "Short subtitle", { max: 160, hint: "e.g. Haldi · ground" })}
        <div>
          <label htmlFor={f.id("status")} className="label">
            Status
          </label>
          <select {...f.field("status")} defaultValue={details.status} className="field">
            <option value="DRAFT">Draft (hidden)</option>
            <option value="ACTIVE">Active (on sale)</option>
            <option value="ARCHIVED">Archived (hidden)</option>
          </select>
        </div>
        <div>
          <label htmlFor={f.id("categoryId")} className="label">
            Category
          </label>
          <select {...f.field("categoryId")} defaultValue={details.categoryId ?? ""} className="field">
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {text("description", "Description", { rows: 4, max: 5000 })}
      <div className="grid gap-4 md:grid-cols-2">
        {text("ingredients", "Ingredients", { rows: 2, max: 1000 })}
        {text("allergenInfo", "Allergen information", { rows: 2, max: 500, hint: "e.g. Packed in a facility that also handles nuts." })}
        {text("usageInstructions", "How to use", { rows: 3, max: 2000 })}
        {text("storageInstructions", "Storage instructions", { rows: 3, max: 1000 })}
        {text("shelfLife", "Shelf life / best before", { max: 200, hint: "e.g. Best before 12 months from packing" })}
        {text("countryOfOrigin", "Country of origin", { max: 80 })}
        <Field f={f} name="netUnit" label="Sold by" hint="Volume for oils and other liquids: prices then show per 100 ml, and packs in ml / L.">
          <select {...f.field("netUnit", { hint: true })} defaultValue={details.netUnit} className="field">
            <option value="g">Weight (grams)</option>
            <option value="ml">Volume (millilitres)</option>
          </select>
        </Field>
      </div>
      {text("nutritionInfo", "Nutrition information (optional)", { rows: 3, max: 2000 })}
      <div className="grid gap-4 md:grid-cols-2">
        <Field f={f} name="tags" label="Search keywords" hint="Comma-separated, e.g. haldi, turmeric">
          <input {...f.field("tags", { hint: true })} defaultValue={details.tags.join(", ")} maxLength={500} className="field" />
        </Field>
        {text("slug", "Web address", { max: 80, hint: `thefarmdoor.com/products/${details.slug} · lower-case letters, numbers and dashes` })}
        {text("seoTitle", "Search engine title (optional)", { max: 120 })}
        {text("seoDescription", "Search engine description (optional)", { max: 300 })}
      </div>
      <details className="rounded-xl border border-line p-4" open={hindiCount > 0}>
        <summary className="cursor-pointer font-semibold text-forest">
          Hindi version <span className="font-normal text-muted">({hindiCount ? `${hindiCount} of ${HINDI_FIELDS.length} filled in` : "not added yet"}; empty fields show the English on the Hindi shop)</span>
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {text("nameHi", "Name in Hindi", { max: 120, hint: "e.g. हल्दी पाउडर", lang: "hi" })}
          {text("subtitleHi", "Short subtitle in Hindi", { max: 160, lang: "hi" })}
        </div>
        <div className="mt-4 space-y-4">
          {text("descriptionHi", "Description in Hindi", { rows: 4, max: 5000, lang: "hi" })}
          <div className="grid gap-4 md:grid-cols-3">
            {text("ingredientsHi", "Ingredients in Hindi", { rows: 2, max: 1000, lang: "hi" })}
            {text("usageInstructionsHi", "How to use, in Hindi", { rows: 3, max: 2000, lang: "hi" })}
            {text("storageInstructionsHi", "Storage, in Hindi", { rows: 3, max: 1000, lang: "hi" })}
          </div>
        </div>
      </details>
      <fieldset>
        <legend className="label">Show in</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isFeatured" defaultChecked={details.isFeatured} className="size-4 accent-forest" /> Featured (listed first)
          </label>
          {collections.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="collectionIds" value={c.id} defaultChecked={memberOf.includes(c.id)} className="size-4 accent-forest" /> {c.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-forest px-6 py-2.5 font-semibold text-ivory disabled:opacity-60">
          {pending ? "Saving…" : "Save details"}
        </button>
        {hasFieldErrors ? (
          <span className="text-sm font-semibold text-chilli">Please fix the highlighted fields.</span>
        ) : (
          state && <span className={`text-sm font-semibold ${state.ok ? "text-forest" : "text-chilli"}`}>{state.message}</span>
        )}
      </div>
    </form>
  );
}

export function ImageManager({ productId, images }: { productId: number; images: { id: number; mediaId: number; alt: string }[] }) {
  const [state, action, uploading] = useActionState<CatalogResult, FormData>(uploadImagesAction.bind(null, productId), null);
  const upload = useForm({
    schema: imageUploadSchema,
    values: (fd) => ({ images: fd.getAll("images").filter((x) => x instanceof File && x.size > 0), alt: fd.get("alt") ?? "" }),
    action,
    state,
    resetOnSuccess: true,
  });
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((img, i) => (
            <li key={img.id} className="rounded-xl border border-line p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(img.mediaId, "thumb")!} alt={img.alt} className="aspect-square w-full rounded-lg object-cover" />
              <input
                aria-label="Image description"
                defaultValue={img.alt}
                placeholder="Describe the image"
                className="field mt-2 px-2 py-1 text-xs"
                onBlur={(e) => e.target.value !== img.alt && start(() => updateImageAltAction(img.id, e.target.value))}
              />
              <div className="mt-2 flex justify-between text-xs">
                <span className="flex gap-2">
                  <button type="button" disabled={pending || i === 0} onClick={() => start(() => moveImageAction(img.id, -1))} className="font-semibold text-forest disabled:opacity-30" aria-label="Move earlier">
                    ←
                  </button>
                  <button type="button" disabled={pending || i === images.length - 1} onClick={() => start(() => moveImageAction(img.id, 1))} className="font-semibold text-forest disabled:opacity-30" aria-label="Move later">
                    →
                  </button>
                </span>
                <button type="button" disabled={pending} onClick={() => window.confirm("Remove this image from the product?") && start(() => deleteImageAction(img.id))} className="font-semibold text-chilli">
                  Remove
                </button>
              </div>
              {i === 0 && <p className="mt-1 text-[11px] text-muted">Main image</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No images yet. Square photos look best (at least 1200 × 1200 px).</p>
      )}
      <form {...upload.formProps} className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor={upload.id("images")} className="sr-only">
            Images
          </label>
          <input {...upload.field("images", { hint: true })} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="text-sm" />
          <label htmlFor={upload.id("alt")} className="sr-only">
            Description
          </label>
          <input {...upload.field("alt")} maxLength={200} placeholder="Description (optional)" className="field w-56 py-2 text-sm" />
          <button type="submit" disabled={uploading} className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest disabled:opacity-60">
            {uploading ? "Uploading…" : "Upload"}
          </button>
          {state && !upload.error("images") && <span className={`text-sm ${state.ok ? "text-forest" : "text-chilli"}`}>{state.message}</span>}
        </div>
        <p id={`${upload.id("images")}-hint`} className="text-xs text-muted">
          JPEG, PNG, WebP or AVIF, up to 8 MB each, 10 at a time.
        </p>
        <FieldError f={upload} name="images" />
        <FieldError f={upload} name="alt" />
      </form>
    </div>
  );
}

export function DeleteProductButton({ productId }: { productId: number }) {
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<CatalogResult>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      {!confirm ? (
        <button type="button" onClick={() => setConfirm(true)} className="text-sm font-semibold text-chilli underline">
          Delete product…
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Delete permanently? Products with orders can only be archived.</span>
          <button type="button" disabled={pending} onClick={() => start(async () => setResult(await deleteProductAction(productId)))} className="rounded-full bg-chilli px-4 py-1.5 font-semibold text-white">
            Delete
          </button>
          <button type="button" onClick={() => setConfirm(false)} className="font-semibold text-muted underline">
            Cancel
          </button>
        </div>
      )}
      {result && !result.ok && <Notice tone="error" className="mt-2">{result.message}</Notice>}
    </div>
  );
}

export function GroupForm({
  kind,
  group,
  categories = [],
}: {
  kind: "category" | "collection";
  group?: { id: number; name: string; slug: string; description: string; nameHi: string; descriptionHi: string; sortOrder: number; isActive: boolean; showOnHome?: boolean; showInShopBy?: boolean; categoryId?: number | null };
  /** For collections: categories it can be shown inside. */
  categories?: { id: number; name: string }[];
}) {
  const [state, action, pending] = useActionState<CatalogResult, FormData>(saveGroupAction.bind(null, kind), null);
  const f = useForm({ schema: groupFormSchema, action, state, resetOnSuccess: !group });
  const errors = ["name", "slug", "description", "nameHi", "descriptionHi", "sortOrder", "categoryId"].filter((n) => f.error(n));
  return (
    <form {...f.formProps} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1.2fr_1fr_2fr_80px_auto_auto]">
      {group && <input type="hidden" name="id" value={group.id} />}
      <input {...f.field("name")} defaultValue={group?.name} maxLength={80} placeholder="Name" aria-label="Name" className="field py-2 text-sm" />
      <input {...f.field("slug")} defaultValue={group?.slug} maxLength={80} placeholder="web-address" aria-label="Web address" className="field py-2 text-sm" />
      <input {...f.field("description")} defaultValue={group?.description} maxLength={500} placeholder="Short description" aria-label="Description" className="field py-2 text-sm" />
      <input {...f.field("sortOrder")} defaultValue={group?.sortOrder ?? 0} inputMode="numeric" maxLength={4} aria-label="Sort order" className="field py-2 text-sm" />
      <div className="flex flex-col justify-center gap-1 text-xs">
        <label className="flex min-h-6 items-center gap-1.5">
          <input type="checkbox" name="isActive" defaultChecked={group?.isActive ?? true} className="size-4 accent-forest" /> Visible
        </label>
        {kind === "collection" && (
          <label className="flex min-h-6 items-center gap-1.5">
            <input type="checkbox" name="showOnHome" defaultChecked={group?.showOnHome ?? false} className="size-4 accent-forest" /> On home page
          </label>
        )}
        {kind === "collection" && (
          <label className="flex min-h-6 items-center gap-1.5">
            <input type="checkbox" name="showInShopBy" defaultChecked={group?.showInShopBy ?? false} className="size-4 accent-forest" /> In &ldquo;Shop by dish&rdquo;
          </label>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-ivory disabled:opacity-60">
          {group ? "Save" : "Add"}
        </button>
        {state && !errors.length && <span className={`text-xs ${state.ok ? "text-forest" : "text-chilli"}`}>{state.message}</span>}
      </div>
      {/* Hindi shop: empty fields show the English. */}
      <input {...f.field("nameHi")} defaultValue={group?.nameHi} maxLength={80} lang="hi" placeholder="Name in Hindi (optional)" aria-label="Name in Hindi" className="field py-2 text-sm" />
      <input
        {...f.field("descriptionHi")}
        defaultValue={group?.descriptionHi}
        maxLength={500}
        lang="hi"
        placeholder="Short description in Hindi (optional)"
        aria-label="Description in Hindi"
        className={`field py-2 text-sm ${kind === "collection" ? "sm:col-span-3" : "sm:col-span-5"}`}
      />
      {kind === "collection" && (
        <select {...f.field("categoryId")} defaultValue={group?.categoryId ?? ""} aria-label="Show as a filter inside a category" className="field py-2 text-sm sm:col-span-2">
          <option value="">Not inside a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              Filter inside {c.name}
            </option>
          ))}
        </select>
      )}
      {errors.map((n) => (
        <FieldError key={n} f={f} name={n} className="text-xs sm:col-span-6" />
      ))}
    </form>
  );
}
