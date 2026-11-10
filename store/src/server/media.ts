/**
 * Image uploads. Each image is stored as WebP in four sizes, in Postgres (a
 * small catalogue keeps hosting to a single service), and served by
 * /media/[id]/[size] with long-lived caching:
 *
 *   full    up to 1600 px (large screens, Google Shopping, link previews)
 *   medium  up to 800 px (product photos on phones)
 *   thumb   600 px square (product cards on larger screens)
 *   small   300 px square (product cards on phones, cart lines)
 *
 * medium and small were added later: for older images they're made the first
 * time they're requested, then stored.
 */
import { eq } from "drizzle-orm";
import sharp, { type Sharp } from "sharp";
import type { DbOrTx } from "@/db";
import { media } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import type { MediaSize } from "@/lib/media-url";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export class MediaError extends Error {}

const medium = (image: Sharp) => image.clone().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
const small = (image: Sharp) => image.clone().resize({ width: 300, height: 300, fit: "cover" }).webp({ quality: 74 }).toBuffer();

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
    .values({ sha256: hash, mime: "image/webp", width: full.info.width, height: full.info.height, full: full.data, thumb, medium: await medium(image), small: await small(image), alt })
    .returning({ id: media.id });
  return row.id;
}

/** Image bytes for one size, making (and saving) medium/small for images uploaded before those sizes existed. */
export async function imageBytes(db: DbOrTx, id: number, size: MediaSize): Promise<{ data: Buffer; mime: string } | null> {
  if (size === "full" || size === "thumb") {
    const [row] = await db.select({ data: size === "full" ? media.full : media.thumb, mime: media.mime }).from(media).where(eq(media.id, id));
    return row ?? null;
  }
  const column = size === "medium" ? media.medium : media.small;
  const [row] = await db.select({ data: column, mime: media.mime }).from(media).where(eq(media.id, id));
  if (!row) return null;
  if (row.data) return { data: row.data, mime: row.mime };
  const [source] = await db.select({ full: media.full }).from(media).where(eq(media.id, id));
  const data = await (size === "medium" ? medium : small)(sharp(source.full));
  await db.update(media).set(size === "medium" ? { medium: data } : { small: data }).where(eq(media.id, id));
  return { data, mime: "image/webp" };
}
