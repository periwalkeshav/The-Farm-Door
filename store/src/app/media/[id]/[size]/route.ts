import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { media } from "@/db/schema";

/** Serves product images stored in the database. Content never changes for an id, so it's cached for a year. */
export async function GET(_req: Request, ctx: RouteContext<"/media/[id]/[size]">) {
  const { id, size } = await ctx.params;
  const mediaId = Number(id);
  if (!Number.isInteger(mediaId) || mediaId <= 0 || (size !== "full" && size !== "thumb")) {
    return new Response("Not found", { status: 404 });
  }
  const [row] = await getDb()
    .select({ data: size === "full" ? media.full : media.thumb, mime: media.mime })
    .from(media)
    .where(eq(media.id, mediaId));
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
