import { getCategoryBySlug } from "@/data/catalog";
import { brandImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og-image";

export const alt = "A category of spices at The Farm Door";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const category = await getCategoryBySlug((await params).slug);
  return brandImage({ eyebrow: "Shop", title: category?.name ?? "Our spices", subtitle: category?.description?.slice(0, 110) || "Delivered across India." });
}
