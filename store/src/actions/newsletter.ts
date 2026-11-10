"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { emailOptOuts, newsletterSubscribers } from "@/db/schema";
import { clientIp } from "@/data/request";
import { normalizeEmail } from "@/lib/india";
import { hitRateLimit } from "@/server/rate-limit";
import { checkOptOutToken, optOut } from "@/server/reminders";

export type SubscribeState = { ok: boolean; message: string } | null;

export async function subscribeAction(_prev: SubscribeState, formData: FormData): Promise<SubscribeState> {
  const parsed = z.email().max(200).safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { ok: false, message: "Please enter a valid email address." };
  const db = getDb();
  if (!(await hitRateLimit(db, `newsletter:${await clientIp()}`, 10, 3600)).allowed) return { ok: false, message: "Please try again later." };
  const email = normalizeEmail(parsed.data);
  await db
    .insert(newsletterSubscribers)
    .values({ email, source: "website" })
    .onConflictDoUpdate({ target: newsletterSubscribers.email, set: { unsubscribedAt: null, consentedAt: new Date() } });
  // Subscribing again cancels an earlier "no offers or reminders" request.
  await db.delete(emailOptOuts).where(eq(emailOptOuts.email, email));
  return { ok: true, message: "Thanks! You're subscribed." };
}

export type OptOutState = { ok: boolean; message: string } | null;

/** From the link in reminder emails. A button press (not the link itself) opts out, so email scanners can't trigger it. */
export async function optOutAction(email: string, token: string): Promise<OptOutState> {
  if (!checkOptOutToken(email, token)) return { ok: false, message: "This link isn't valid. Please use the link from your email." };
  await optOut(getDb(), email);
  return { ok: true, message: "Done. We won't send you reminders or offers. You'll still get emails about orders you place." };
}
