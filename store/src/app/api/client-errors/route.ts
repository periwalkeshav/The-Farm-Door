import { z } from "zod";
import { getDb } from "@/db";
import { clientIp } from "@/data/request";
import { recordError } from "@/server/errors";
import { hitRateLimit } from "@/server/rate-limit";

const schema = z.object({
  message: z.string().max(1000),
  digest: z.string().max(100).optional(),
  path: z.string().max(500).optional(),
  stack: z.string().max(4000).optional(),
});

/** Errors from visitors' browsers (error pages and uncaught script errors). */
export async function POST(request: Request) {
  const db = getDb();
  if (!(await hitRateLimit(db, `client-error:${await clientIp()}`, 10, 600)).allowed) return new Response(null, { status: 204 });
  const body = await request.text();
  if (body.length > 8000) return new Response(null, { status: 413 });
  let parsed;
  try {
    parsed = schema.safeParse(JSON.parse(body));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!parsed.success) return new Response(null, { status: 400 });
  try {
    await recordError(db, { source: "browser", ...parsed.data });
  } catch (err) {
    console.error("[errors] could not record a browser error:", err);
  }
  return new Response(null, { status: 204 });
}
