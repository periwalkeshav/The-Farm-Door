import { brandImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og-image";

export const alt = "The Farm Door: Indian spices delivered across India";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return brandImage({ title: "Indian spices, straight from the farm", subtitle: "Whole spices, ground spices and masala blends, delivered across India." });
}
