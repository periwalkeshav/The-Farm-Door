/**
 * Scheduled work, run by /api/cron/tick every ~5 minutes:
 *  - expire unpaid / unconfirmed orders (after checking Razorpay for missed payments)
 *  - one reminder email for online-payment orders that were never paid
 *  - "how are your spices?" review requests a few days after delivery
 *  - "it's back in stock" emails for customers who asked
 *  - reorder reminders customers set on delivered orders
 *  - pull courier tracking for shipments the webhook hasn't updated
 *  - clean up expired sessions, sign-in codes and rate-limit counters
 *  - once a day: low-stock alert and yesterday's summary email to the owner
 * A transaction-scoped Postgres advisory lock stops two runs overlapping (it's
 * held on one pooled connection for the whole run and released at commit).
 */
import { lt, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { loginCodes } from "@/db/schema";
import { env } from "@/lib/env";
import { purgeExpiredSessions } from "./auth/sessions";
import { sendEmail } from "./email/send";
import { dailySummaryEmail, lowStockEmail } from "./email/templates";
import { syncActiveShipments } from "./orders/lifecycle";
import { expireOverdueOrders } from "./orders/payment";
import { purgeRateLimits } from "./rate-limit";
import { sendReviewRequests, sendUnpaidReminders } from "./reminders";
import { sendRefillReminders } from "./refills";
import { sendBackInStockAlerts } from "./stock-alerts";
import { addDays, istToday, lowStock, rangeFromDates, salesSummary, workQueue } from "./reports";
import { readSettings } from "./settings";

const LOCK_KEY = 482_917_001;

/** True the first time it's called for this key (e.g. one email per day). */
async function once(db: Database, key: string): Promise<boolean> {
  const r = await db.execute(sql`insert into counters (key, value) values (${key}, 1) on conflict (key) do nothing returning key`);
  return r.rows.length === 1;
}

export async function runTick(db: Database, now = new Date()) {
  return db.transaction(async (lockTx) => {
    const lock = await lockTx.execute<{ ok: boolean }>(sql`select pg_try_advisory_xact_lock(${LOCK_KEY}) as ok`);
    if (!lock.rows[0]?.ok) return { skipped: "another run in progress" } as Record<string, unknown>;
    return work(db, now);
  });
}

async function work(db: Database, now: Date) {
  const summary: Record<string, unknown> = {};
  summary.orders = await expireOverdueOrders(db);
  summary.unpaidReminders = await sendUnpaidReminders(db, now);
  summary.reviewRequests = await sendReviewRequests(db, now);
  summary.backInStock = await sendBackInStockAlerts(db);
  summary.refillReminders = await sendRefillReminders(db, now);
  summary.trackingSynced = await syncActiveShipments(db);
  await purgeExpiredSessions(db);
  await db.delete(loginCodes).where(lt(loginCodes.createdAt, sql`now() - interval '1 day'`));
  await purgeRateLimits(db);

  const today = istToday(now);
  const istHour = new Date(now.getTime() + 5.5 * 3600_000).getUTCHours();
  const notifications = await readSettings(db, "notifications");
  const admin = `${env().APP_URL}/admin`;

  if (notifications.ownerEmail && istHour >= 8) {
    if (notifications.lowStockEmails && (await once(db, `job:low-stock:${today}`))) {
      const items = await lowStock(db);
      if (items.length) {
        await sendEmail(db, {
          to: notifications.ownerEmail,
          ...lowStockEmail(
            items.map((i) => ({ name: i.name, sku: i.sku, available: Number(i.available), unit: i.unit === "GRAM" ? "g" : "packs", threshold: Number(i.threshold) })),
            `${admin}/inventory?show=low`,
          ),
          template: "low-stock",
        });
        summary.lowStockEmail = items.length;
      }
    }
    if (notifications.dailySummary && (await once(db, `job:daily-summary:${today}`))) {
      const yesterday = addDays(today, -1);
      const [s, q] = await Promise.all([salesSummary(db, rangeFromDates(yesterday, yesterday)), workQueue(db)]);
      await sendEmail(db, {
        to: notifications.ownerEmail,
        ...dailySummaryEmail({ date: yesterday, orders: s.orders, netSalesPaise: s.netPaise, toPack: q.to_pack, codAwaitingConfirmation: q.awaiting_cod }, admin),
        template: "daily-summary",
      });
      summary.dailySummary = yesterday;
    }
  }
  // Forget once-per-day markers older than 30 days.
  await db.execute(sql`delete from counters where key like 'job:%' and right(key, 10) < ${addDays(today, -30)}`);
  return summary;
}
