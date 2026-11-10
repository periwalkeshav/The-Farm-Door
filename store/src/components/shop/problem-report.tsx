"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { reportProblemAction, type ProblemState } from "@/actions/orders";
import { CharCount, Field, FieldError, useForm } from "@/components/form";
import { buttonClass, Notice } from "@/components/ui";
import { MAX_PROBLEM_PHOTOS, PROBLEM_KINDS, problemReportSchema } from "@/lib/form-schemas";
import { formValues } from "@/lib/validation";
import { useI18n } from "@/i18n/client";

const KIND_LABELS: Record<(typeof PROBLEM_KINDS)[number], string> = {
  DAMAGED: "Damaged or leaking",
  WRONG_ITEM: "Wrong item sent",
  EXPIRED: "Past its best-before date",
  MISSING: "Item missing from the parcel",
  OTHER: "Something else",
};

type Photo = { file: File; url: string };

/** Phone photos are often 3–8 MB; shrink them to ~1600 px JPEG before upload (fast on mobile data). */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" }) : file;
  } catch {
    return file; // The browser can't read it; the server will say so if it can't either.
  }
}

export function ReportProblem({
  orderNumber,
  token,
  items,
  deadline,
}: {
  orderNumber: string;
  token: string;
  items: { id: number; label: string }[];
  deadline: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState<ProblemState, FormData>(reportProblemAction.bind(null, orderNumber, token), null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [description, setDescription] = useState("");
  const photosRef = useRef<Photo[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const schema = problemReportSchema.extend({
    photos: z.number().min(1, "Add at least one photo of the item and its packaging.").max(MAX_PROBLEM_PHOTOS, `Choose up to ${MAX_PROBLEM_PHOTOS} photos.`),
  });
  const f = useForm({
    schema,
    values: (fd) => ({ ...formValues(fd), items: fd.getAll("items"), photos: photos.length }),
    action: (fd) => {
      fd.delete("photos");
      for (const p of photos) fd.append("photos", p.file);
      dispatch(fd);
    },
    state,
  });

  async function addPhotos(list: FileList | null) {
    if (!list?.length) return;
    setPreparing(true);
    const room = MAX_PROBLEM_PHOTOS - photos.length;
    const picked = Array.from(list).slice(0, Math.max(0, room));
    const ready = await Promise.all(picked.map(shrink));
    const tooBig = ready.some((file) => file.size > 8 * 1024 * 1024);
    setPhotos((prev) => [...prev, ...ready.filter((file) => file.size <= 8 * 1024 * 1024).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    setPreparing(false);
    const errors = { ...f.errors };
    delete errors.photos;
    if (tooBig) errors.photos = t("That photo is too large (8 MB maximum).");
    else if (list.length > room) errors.photos = t("Only {max} photos can be added.", { max: MAX_PROBLEM_PHOTOS });
    f.setErrors(errors);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  }

  if (state?.ok) return <Notice tone="success">{t(state.message)}</Notice>;

  return (
    <div>
      <p className="text-sm text-muted">
        {t("Damaged, wrong, past its date or missing? Tell us by {deadline} with photos and we'll send a replacement or refund it.", { deadline })}
      </p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "sm", "mt-3")}>
          {t("Report a problem")}
        </button>
      ) : (
        <form {...f.formProps} className="mt-4 space-y-5" encType="multipart/form-data">
          {state && !state.ok && <Notice tone="error">{t(state.message)}</Notice>}
          <fieldset>
            <legend className="label">{t("Which item?")}</legend>
            <div className="space-y-2">
              {items.map((i) => (
                <label key={i.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="items" value={i.id} defaultChecked={items.length === 1} className="mt-0.5 size-4 accent-forest" aria-describedby={f.error("items") ? `${f.id("items")}-error` : undefined} />
                  {i.label}
                </label>
              ))}
            </div>
            <FieldError f={f} name="items" />
          </fieldset>
          <fieldset>
            <legend className="label">{t("What went wrong?")}</legend>
            <div className="space-y-2">
              {PROBLEM_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="kind" value={k} className="size-4 accent-forest" aria-describedby={f.error("kind") ? `${f.id("kind")}-error` : undefined} />
                  {t(KIND_LABELS[k])}
                </label>
              ))}
            </div>
            <FieldError f={f} name="kind" />
          </fieldset>
          <Field f={f} name="description" label={t("Tell us what happened")}>
            <textarea {...f.field("description")} rows={4} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} className="field" placeholder={t("e.g. The jar lid was broken and some powder had spilled.")} />
            <CharCount value={description.length} max={1000} />
          </Field>
          <div>
            <label htmlFor={f.id("photos")} className="label">
              {t("Photos of the item and packaging")} <span className="font-normal text-muted">{t("(1 to {max})", { max: MAX_PROBLEM_PHOTOS })}</span>
            </label>
            <input
              id={f.id("photos")}
              name="photos"
              type="file"
              accept="image/*"
              multiple
              disabled={photos.length >= MAX_PROBLEM_PHOTOS || preparing}
              aria-invalid={f.error("photos") ? true : undefined}
              aria-describedby={f.error("photos") ? `${f.id("photos")}-error` : undefined}
              onChange={(e) => {
                void addPhotos(e.currentTarget.files);
                e.currentTarget.value = "";
              }}
              className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-forest file:px-4 file:py-2 file:font-semibold file:text-ivory"
            />
            {preparing && <p className="mt-1 text-xs text-muted" role="status">{t("Preparing photos…")}</p>}
            <FieldError f={f} name="photos" />
            {photos.length > 0 && (
              <ul className="mt-3 grid grid-cols-4 gap-2">
                {photos.map((p, i) => (
                  <li key={p.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                    <img src={p.url} alt={t("Photo {n}", { n: i + 1 })} className="aspect-square w-full rounded-lg object-cover" />
                    <button type="button" onClick={() => removePhoto(i)} className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-ink/80 text-sm font-bold text-white" aria-label={t("Remove photo {n}", { n: i + 1 })}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={pending || preparing} className={buttonClass("primary", "md")}>
              {pending ? t("Sending…") : t("Send report")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "md")}>
              {t("Cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
