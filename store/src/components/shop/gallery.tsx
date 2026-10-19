"use client";

import { useState } from "react";
import { cn } from "@/components/ui";
import { mediaUrl } from "@/lib/media-url";

export function Gallery({ images, name }: { images: { mediaId: number; alt: string }[]; name: string }) {
  const [index, setIndex] = useState(0);
  if (!images.length) return <div className="aspect-square rounded-[var(--radius-card)] bg-sand" aria-label={`${name}: no image yet`} />;
  const current = images[Math.min(index, images.length - 1)];
  return (
    <div>
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-sand">
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP from /media */}
        <img src={mediaUrl(current.mediaId, "full")!} alt={current.alt} width={1200} height={1200} className="aspect-square w-full object-cover" fetchPriority="high" />
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img.mediaId}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === index}
              className={cn("size-20 shrink-0 overflow-hidden rounded-xl border-2", i === index ? "border-forest" : "border-transparent")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(img.mediaId, "thumb")!} alt="" className="size-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
