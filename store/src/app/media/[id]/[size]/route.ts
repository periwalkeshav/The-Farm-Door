import { getDb } from "@/db";
import { MEDIA_SIZES, type MediaSize } from "@/lib/media-url";
import { imageBytes } from "@/server/media";

/** Serves product images stored in the database. Content never changes for an id, so it's cached for a year. */
export async function GET(_req: Request, ctx: RouteContext<"/media/[id]/[size]">) {
  const { id, size } = await ctx.params;
  const mediaId = Number(id);
  if (!Number.isInteger(mediaId) || mediaId <= 0 || !MEDIA_SIZES.includes(size as MediaSize)) {
    return new Response("Not found", { status: 404 });
  }
  const row = await imageBytes(getDb(), mediaId, size as MediaSize);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
