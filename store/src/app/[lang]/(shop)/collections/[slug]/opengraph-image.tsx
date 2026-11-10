import { getCollectionBySlug } from "@/data/catalog";
import { brandImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og-image";

export const alt = "A collection of spices at The Farm Door";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const collection = await getCollectionBySlug((await params).slug);
  return brandImage({ eyebrow: "Collection", title: collection?.name ?? "Our spices", subtitle: collection?.description?.slice(0, 110) || "Delivered across India." });
}
