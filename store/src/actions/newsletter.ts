"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { newsletterSubscribers } from "@/db/schema";
import { clientIp } from "@/data/request";
import { normalizeEmail } from "@/lib/india";
import { hitRateLimit } from "@/server/rate-limit";

export type SubscribeState = { ok: boolean; message: string } | null;

export async function subscribeAction(_prev: SubscribeState, formData: FormData): Promise<SubscribeState> {
  const parsed = z.email().max(200).safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { ok: false, message: "Please enter a valid email address." };
  const db = getDb();
  if (!(await hitRateLimit(db, `newsletter:${await clientIp()}`, 10, 3600)).allowed) return { ok: false, message: "Please try again later." };
  await db
    .insert(newsletterSubscribers)
    .values({ email: normalizeEmail(parsed.data), source: "website" })
    .onConflictDoUpdate({ target: newsletterSubscribers.email, set: { unsubscribedAt: null, consentedAt: new Date() } });
  return { ok: true, message: "Thanks! You're subscribed." };
}
