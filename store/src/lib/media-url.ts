export type MediaSize = "full" | "medium" | "thumb" | "small";

export const MEDIA_SIZES: readonly MediaSize[] = ["full", "medium", "thumb", "small"];

export function mediaUrl(id: number | null | undefined, size: MediaSize = "thumb"): string | null {
  return id ? `/media/${id}/${size}` : null;
}

/**
 * srcset/sizes for an image, so phones download a smaller file.
 * "square" is the cropped card image (300/600 px); "photo" is the whole picture (800/1600 px).
 */
export function mediaSrcSet(id: number, kind: "square" | "photo") {
  return kind === "square" ? `/media/${id}/small 300w, /media/${id}/thumb 600w` : `/media/${id}/medium 800w, /media/${id}/full 1600w`;
}
