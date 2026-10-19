import { revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { runTick } from "@/server/jobs";

async function handle(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env().CRON_SECRET}`)) return new Response("Unauthorized", { status: 401 });
  const result = await runTick(getDb());
  revalidateTag("stock", "max");
  return Response.json({ ok: true, ...result });
}

/** Scheduler entry point. Call every ~5 minutes with "Authorization: Bearer <CRON_SECRET>". */
export const GET = handle;
export const POST = handle;
