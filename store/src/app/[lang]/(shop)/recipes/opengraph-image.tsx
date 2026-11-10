import { brandImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og-image";

export const alt = "Recipes from The Farm Door";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return brandImage({ eyebrow: "Recipes", title: "Cook with our spices", subtitle: "Everyday Indian recipes, with the spices you need for each." });
}
