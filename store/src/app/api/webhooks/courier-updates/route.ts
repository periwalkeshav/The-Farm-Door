import { getDb } from "@/db";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { handleShiprocketEvent } from "@/server/webhooks";

/**
 * Shiprocket tracking webhook (Settings > API > Webhooks in Shiprocket). The URL
 * deliberately avoids the word "shiprocket", which Shiprocket doesn't allow.
 * The security token you set there arrives in the x-api-key header.
 */
export async function POST(request: Request) {
  const token = env().SHIPROCKET_WEBHOOK_TOKEN;
  if (!token) return new Response("Not configured", { status: 404 });
  if (!safeEqual(request.headers.get("x-api-key") ?? "", token)) return new Response("Unauthorized", { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: true }); // Shiprocket expects 200; ignore malformed calls.
  }
  try {
    await handleShiprocketEvent(getDb(), body);
  } catch (err) {
    console.error("[webhook:courier] failed:", err);
    // Still acknowledge: the scheduled tracking sync will pick up the status.
  }
  return Response.json({ ok: true });
}
