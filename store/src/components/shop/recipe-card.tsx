import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { mediaSrcSet, mediaUrl } from "@/lib/media-url";

export async function RecipeCard({ r }: { r: { slug: string; title: string; summary?: string; imageId: number | null; prepMinutes?: number | null; cookMinutes?: number | null } }) {
  const { t, href } = await getI18n();
  const minutes = (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
  const image = mediaUrl(r.imageId, "thumb");
  return (
    <Link href={href(`/recipes/${r.slug}`)} className="group card block overflow-hidden hover:border-forest">
      <div className="aspect-[4/3] bg-sand">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP from /media
          <img
            src={image}
            srcSet={mediaSrcSet(r.imageId!, "square")}
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 48vw, 100vw"
            alt=""
            width={600}
            height={450}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition group-hover:scale-[1.02]"
          />
        )}
      </div>
      <div className="p-4">
        <p className="font-display text-lg font-semibold text-forest">{r.title}</p>
        {r.summary && <p className="mt-1 line-clamp-2 text-sm text-muted">{r.summary}</p>}
        {minutes > 0 && <p className="mt-2 text-xs font-semibold text-saffron-deep">{t("{minutes} min", { minutes })}</p>}
      </div>
    </Link>
  );
}
