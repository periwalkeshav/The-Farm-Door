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
import { Notice } from "@/components/ui";
import { mediaUrl } from "@/lib/media-url";

type Cat = { id: number; name: string };

export function NewProductForm({ categories }: { categories: Cat[] }) {
  const [state, action, pending] = useActionState<CatalogResult, FormData>(createProductAction, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="np-name" className="label">
          New product name
        </label>
        <input id="np-name" name="name" required className="field w-64 py-2" placeholder="e.g. Kasuri Methi" />
      </div>
      <div>
        <label htmlFor="np-cat" className="label">
          Category
        </label>
        <select id="np-cat" name="categoryId" className="field w-auto py-2">
          <option value="">None</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory disabled:opacity-60">
        {pending ? "Creating…" : "Create draft"}
      </button>
      {state && !state.ok && <p className="w-full text-sm text-chilli">{state.message}</p>}
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
};

export function ProductDetailsForm({ productId, details, categories, collections, memberOf }: { productId: number; details: Details; categories: Cat[]; collections: Cat[]; memberOf: number[] }) {
  const [state, action, pending] = useActionState<CatalogResult, FormData>(updateProductAction.bind(null, productId), null);
  const text = (name: keyof Details, label: string, opts: { rows?: number; hint?: string; max?: number } = {}) => (
    <div>
      <label htmlFor={`pd-${name}`} className="label">
        {label}
      </label>
      {opts.rows ? (
        <textarea id={`pd-${name}`} name={name} rows={opts.rows} defaultValue={String(details[name] ?? "")} maxLength={opts.max} className="field" />
      ) : (
        <input id={`pd-${name}`} name={name} defaultValue={String(details[name] ?? "")} maxLength={opts.max} className="field" />
      )}
      {opts.hint && <p className="mt-1 text-xs text-muted">{opts.hint}</p>}
    </div>
  );
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {text("name", "Name", { max: 120 })}
        {text("subtitle", "Short subtitle", { max: 160, hint: "e.g. Haldi · ground" })}
        <div>
          <label htmlFor="pd-status" className="label">
            Status
          </label>
          <select id="pd-status" name="status" defaultValue={details.status} className="field">
            <option value="DRAFT">Draft (hidden)</option>
            <option value="ACTIVE">Active (on sale)</option>
            <option value="ARCHIVED">Archived (hidden)</option>
          </select>
        </div>
        <div>
          <label htmlFor="pd-cat" className="label">
            Category
          </label>
          <select id="pd-cat" name="categoryId" defaultValue={details.categoryId ?? ""} className="field">
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
        {text("ingredients", "Ingredients", { rows: 2 })}
        {text("allergenInfo", "Allergen information", { rows: 2, hint: "e.g. Packed in a facility that also handles nuts." })}
        {text("usageInstructions", "How to use", { rows: 3 })}
        {text("storageInstructions", "Storage instructions", { rows: 3 })}
        {text("shelfLife", "Shelf life / best before", { hint: "e.g. Best before 12 months from packing" })}
        {text("countryOfOrigin", "Country of origin")}
      </div>
      {text("nutritionInfo", "Nutrition information (optional)", { rows: 3 })}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="pd-tags" className="label">
            Search keywords
          </label>
          <input id="pd-tags" name="tags" defaultValue={details.tags.join(", ")} className="field" />
          <p className="mt-1 text-xs text-muted">Comma-separated, e.g. haldi, turmeric</p>
        </div>
        {text("slug", "Web address", { hint: `thefarmdoor.com/products/${details.slug}` })}
        {text("seoTitle", "Search engine title (optional)", { max: 120 })}
        {text("seoDescription", "Search engine description (optional)", { max: 300 })}
      </div>
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
        {state && <span className={`text-sm font-semibold ${state.ok ? "text-forest" : "text-chilli"}`}>{state.message}</span>}
      </div>
    </form>
  );
}

export function ImageManager({ productId, images }: { productId: number; images: { id: number; mediaId: number; alt: string }[] }) {
  const [state, action, uploading] = useActionState<CatalogResult, FormData>(uploadImagesAction.bind(null, productId), null);
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
                <button type="button" disabled={pending} onClick={() => start(() => deleteImageAction(img.id))} className="font-semibold text-chilli">
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
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="file" name="images" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="text-sm" />
        <input name="alt" placeholder="Description (optional)" className="field w-56 py-2 text-sm" />
        <button type="submit" disabled={uploading} className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest disabled:opacity-60">
          {uploading ? "Uploading…" : "Upload"}
        </button>
        {state && <span className={`text-sm ${state.ok ? "text-forest" : "text-chilli"}`}>{state.message}</span>}
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

export function GroupForm({ kind, group }: { kind: "category" | "collection"; group?: { id: number; name: string; slug: string; description: string; sortOrder: number; isActive: boolean; showOnHome?: boolean } }) {
  const [state, action, pending] = useActionState<CatalogResult, FormData>(saveGroupAction.bind(null, kind), null);
  return (
    <form action={action} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1.2fr_1fr_2fr_80px_auto_auto]">
      {group && <input type="hidden" name="id" value={group.id} />}
      <input name="name" defaultValue={group?.name} required placeholder="Name" aria-label="Name" className="field py-2 text-sm" />
      <input name="slug" defaultValue={group?.slug} placeholder="web-address" aria-label="Web address" className="field py-2 text-sm" />
      <input name="description" defaultValue={group?.description} placeholder="Short description" aria-label="Description" className="field py-2 text-sm" />
      <input name="sortOrder" defaultValue={group?.sortOrder ?? 0} inputMode="numeric" aria-label="Sort order" className="field py-2 text-sm" />
      <div className="flex flex-col justify-center gap-1 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="isActive" defaultChecked={group?.isActive ?? true} className="accent-forest" /> Visible
        </label>
        {kind === "collection" && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="showOnHome" defaultChecked={group?.showOnHome ?? false} className="accent-forest" /> On home page
          </label>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-ivory disabled:opacity-60">
          {group ? "Save" : "Add"}
        </button>
        {state && <span className={`text-xs ${state.ok ? "text-forest" : "text-chilli"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
