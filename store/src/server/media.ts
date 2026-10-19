/**
 * Image uploads. Images are resized to a large and a thumbnail WebP and stored
 * in Postgres (a small catalogue keeps hosting to a single service). Served by
 * /media/[id]/[size] with long-lived caching.
 */
import { eq } from "drizzle-orm";
import sharp from "sharp";
import type { DbOrTx } from "@/db";
import { media } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export class MediaError extends Error {}

export async function saveImage(db: DbOrTx, input: Buffer, mime: string, alt = ""): Promise<number> {
  if (!ACCEPTED.has(mime)) throw new MediaError("Upload a JPEG, PNG, WebP or AVIF image.");
  if (input.length > MAX_UPLOAD_BYTES) throw new MediaError("Images must be 8 MB or smaller.");
  const hash = sha256Hex(input);
  const [existing] = await db.select({ id: media.id }).from(media).where(eq(media.sha256, hash));
  if (existing) return existing.id;

  let image = sharp(input, { failOn: "error", limitInputPixels: 40_000_000 }).rotate();
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new MediaError("That file doesn't look like an image.");
  image = image.flatten({ background: "#FFFDF8" });
  const full = await image.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const thumb = await image.clone().resize({ width: 600, height: 600, fit: "cover" }).webp({ quality: 78 }).toBuffer();
  const [row] = await db
    .insert(media)
    .values({ sha256: hash, mime: "image/webp", width: full.info.width, height: full.info.height, full: full.data, thumb, alt })
    .returning({ id: media.id });
  return row.id;
}
