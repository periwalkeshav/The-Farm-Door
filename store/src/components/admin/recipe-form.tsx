"use client";

import { useActionState } from "react";
import { saveRecipeAction, type RecipeResult } from "@/actions/admin/recipes";
import { Field, FieldError, useForm } from "@/components/form";
import { recipeSchema } from "@/lib/form-schemas";
import { mediaUrl } from "@/lib/media-url";

export type RecipeFormValues = {
  id: number | null;
  title: string;
  slug: string;
  summary: string;
  prepMinutes: number | null;
  cookMinutes: number | null;
  serves: number | null;
  ingredients: string;
  method: string;
  titleHi: string;
  summaryHi: string;
  ingredientsHi: string;
  methodHi: string;
  productIds: number[];
  status: "DRAFT" | "PUBLISHED";
  imageId: number | null;
};

export function RecipeForm({ recipe, products }: { recipe: RecipeFormValues; products: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<RecipeResult, FormData>(saveRecipeAction.bind(null, recipe.id), null);
  const f = useForm({ schema: recipeSchema, action, state });
  const hasErrors = Object.keys(f.errors).length > 0;
  const n = (v: number | null) => (v === null ? "" : String(v));
  return (
    <form {...f.formProps} encType="multipart/form-data" className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field f={f} name="title" label="Title">
          <input {...f.field("title")} defaultValue={recipe.title} maxLength={120} className="field" placeholder="e.g. Simple dal tadka" />
        </Field>
        <Field f={f} name="slug" label="Web address" optional hint={recipe.slug ? `thefarmdoor.com/recipes/${recipe.slug}` : "Made from the title if left empty."}>
          <input {...f.field("slug", { hint: true })} defaultValue={recipe.slug} maxLength={80} className="field" />
        </Field>
      </div>
      <Field f={f} name="summary" label="Short summary" optional>
        <textarea {...f.field("summary")} defaultValue={recipe.summary} rows={2} maxLength={300} className="field" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field f={f} name="prepMinutes" label="Prep (minutes)" optional>
          <input {...f.field("prepMinutes")} defaultValue={n(recipe.prepMinutes)} inputMode="numeric" maxLength={4} className="field" />
        </Field>
        <Field f={f} name="cookMinutes" label="Cooking (minutes)" optional>
          <input {...f.field("cookMinutes")} defaultValue={n(recipe.cookMinutes)} inputMode="numeric" maxLength={4} className="field" />
        </Field>
        <Field f={f} name="serves" label="Serves" optional>
          <input {...f.field("serves")} defaultValue={n(recipe.serves)} inputMode="numeric" maxLength={2} className="field" />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field f={f} name="ingredients" label="Ingredients" hint="One per line, e.g. “1 tsp The Farm Door turmeric powder”.">
          <textarea {...f.field("ingredients", { hint: true })} defaultValue={recipe.ingredients} rows={10} maxLength={5000} className="field" />
        </Field>
        <Field f={f} name="method" label="Method" hint="One step per line.">
          <textarea {...f.field("method", { hint: true })} defaultValue={recipe.method} rows={10} maxLength={10_000} className="field" />
        </Field>
      </div>
      <details className="rounded-xl border border-line p-4" open={!!(recipe.titleHi || recipe.methodHi)}>
        <summary className="cursor-pointer font-semibold text-forest">
          Hindi version <span className="font-normal text-muted">(optional; empty fields show the English on the Hindi shop)</span>
        </summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field f={f} name="titleHi" label="Title in Hindi" optional>
              <input {...f.field("titleHi")} defaultValue={recipe.titleHi} maxLength={120} lang="hi" className="field" placeholder="जैसे दाल तड़का" />
            </Field>
            <Field f={f} name="summaryHi" label="Short summary in Hindi" optional>
              <input {...f.field("summaryHi")} defaultValue={recipe.summaryHi} maxLength={300} lang="hi" className="field" />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field f={f} name="ingredientsHi" label="Ingredients in Hindi" optional hint="One per line, in the same order as the English.">
              <textarea {...f.field("ingredientsHi", { hint: true })} defaultValue={recipe.ingredientsHi} rows={6} maxLength={5000} lang="hi" className="field" />
            </Field>
            <Field f={f} name="methodHi" label="Method in Hindi" optional hint="One step per line.">
              <textarea {...f.field("methodHi", { hint: true })} defaultValue={recipe.methodHi} rows={6} maxLength={10_000} lang="hi" className="field" />
            </Field>
          </div>
        </div>
      </details>
      <fieldset>
        <legend className="label">Spices used (shown under the recipe, with add to cart)</legend>
        <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-line p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <label key={p.id} className="flex items-center gap-2">
              <input type="checkbox" name="productIds" value={p.id} defaultChecked={recipe.productIds.includes(p.id)} className="accent-forest" /> {p.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div>
          <label htmlFor="recipe-image" className="label">
            Photo <span className="font-normal text-muted">(optional)</span>
          </label>
          {recipe.imageId && (
            <div className="mb-2 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(recipe.imageId, "small")!} alt="" className="size-16 rounded-lg object-cover" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="removeImage" className="accent-forest" /> Remove photo
              </label>
            </div>
          )}
          <input id="recipe-image" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" aria-invalid={f.error("image") ? true : undefined} className="text-sm" />
          <FieldError f={f} name="image" />
        </div>
        <Field f={f} name="status" label="Status">
          <select {...f.field("status")} defaultValue={recipe.status} className="field">
            <option value="DRAFT">Draft (hidden)</option>
            <option value="PUBLISHED">Published</option>
          </select>
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-forest px-6 py-2.5 font-semibold text-ivory disabled:opacity-60">
          {pending ? "Saving…" : recipe.id ? "Save recipe" : "Create recipe"}
        </button>
        {hasErrors ? <span className="text-sm font-semibold text-chilli">Please fix the highlighted fields.</span> : state && <span className={`text-sm font-semibold ${state.ok ? "text-forest" : "text-chilli"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
