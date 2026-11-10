"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { mediaSrcSet, mediaUrl } from "@/lib/media-url";

/** Product photos. `actions` (save, share) float over the top-right corner of the main photo. */
export function Gallery({ images, name, actions }: { images: { mediaId: number; alt: string }[]; name: string; actions?: ReactNode }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  if (!images.length)
    return (
      <div className="relative aspect-square rounded-[var(--radius-card)] bg-sand" role="img" aria-label={t("{name}: no image yet", { name })}>
        {actions && <div className="absolute top-3 right-3 flex flex-col gap-2">{actions}</div>}
      </div>
    );
  const current = images[Math.min(index, images.length - 1)];
  return (
    <div>
      <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-sand">
        {actions && <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">{actions}</div>}
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP from /media */}
        <img
          src={mediaUrl(current.mediaId, "medium")!}
          srcSet={mediaSrcSet(current.mediaId, "photo")}
          sizes="(min-width: 1152px) 540px, (min-width: 1024px) 46vw, 100vw"
          alt={current.alt}
          width={1200}
          height={1200}
          className="aspect-square w-full object-cover"
          fetchPriority="high"
        />
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img.mediaId}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={t("Show image {n}", { n: i + 1 })}
              aria-current={i === index}
              className={cn("size-20 shrink-0 overflow-hidden rounded-xl border-2", i === index ? "border-forest" : "border-transparent")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(img.mediaId, "small")!} alt="" width={80} height={80} className="size-full object-cover" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
