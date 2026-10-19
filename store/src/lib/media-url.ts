export function mediaUrl(id: number | null | undefined, size: "full" | "thumb" = "thumb"): string | null {
  return id ? `/media/${id}/${size}` : null;
}
