/**
 * Site error alerts. Server errors arrive through src/instrumentation.ts and
 * browser errors through /api/client-errors. Repeats of the same error are
 * grouped, listed in Admin > Site errors, and emailed to the owner at most once
 * an hour each (and at most 20 emails a day in total).
 */
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@/db";
import { errorEvents } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { sendEmail } from "./email/send";
import { errorAlertEmail } from "./email/templates";
import { readSettings } from "./settings";

/** Next.js uses thrown errors for redirects, not-found pages and the like; those aren't problems. */
const CONTROL_FLOW = /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING|NEXT_PRERENDER_INTERRUPTED|HANGING_PROMISE_REJECTION)/;
const ALERT_EVERY_MS = 60 * 60 * 1000;
const MAX_ALERTS_PER_DAY = 20;

export type ErrorReport = { source: "server" | "browser"; message: string; digest?: string; route?: string; path?: string; method?: string; stack?: string };

export function isControlFlow(err: unknown) {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "";
  const message = err instanceof Error ? err.message : String(err);
  return CONTROL_FLOW.test(digest) || CONTROL_FLOW.test(message);
}

const clean = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Browser reports come from the public internet; cap new ones per day so they can't flood the log. */
const MAX_NEW_BROWSER_ERRORS_PER_DAY = 300;

export async function recordError(db: Database, report: ErrorReport) {
  if (report.source === "browser") {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(errorEvents).where(and(eq(errorEvents.source, "browser"), sql`${errorEvents.firstSeenAt} > now() - interval '1 day'`));
    if (n >= MAX_NEW_BROWSER_ERRORS_PER_DAY) return { id: 0, alerted: false };
  }
  const message = clean(report.message, 500) || "Unknown error";
  const path = clean(report.path, 300).split("?")[0];
  const route = clean(report.route, 200);
  // Numbers (ids, order numbers) are blanked so the same bug on different orders counts as one error.
  const fingerprint = sha256Hex(`${report.source}|${route || path.replace(/\d+/g, "#")}|${message.replace(/\d+/g, "#")}`).slice(0, 32);
  const [row] = await db
    .insert(errorEvents)
    .values({ fingerprint, source: report.source, message, digest: clean(report.digest, 100), route, path, method: clean(report.method, 10), stack: (report.stack ?? "").slice(0, 4000) })
    .onConflictDoUpdate({
      target: errorEvents.fingerprint,
      set: { count: sql`${errorEvents.count} + 1`, lastSeenAt: new Date(), resolvedAt: null, path, digest: clean(report.digest, 100) },
    })
    .returning();

  // Claim the alert so concurrent requests don't send it twice.
  const [claimed] = await db
    .update(errorEvents)
    .set({ lastAlertedAt: new Date() })
    .where(and(eq(errorEvents.id, row.id), or(isNull(errorEvents.lastAlertedAt), lt(errorEvents.lastAlertedAt, new Date(Date.now() - ALERT_EVERY_MS)))))
    .returning({ id: errorEvents.id });
  if (!claimed) return { id: row.id, alerted: false };

  const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const counted = await db.execute<{ value: number }>(sql`insert into counters (key, value) values (${`errors:alerts:${day}`}, 1) on conflict (key) do update set value = counters.value + 1 returning value`);
  if ((counted.rows[0]?.value ?? 0) > MAX_ALERTS_PER_DAY) return { id: row.id, alerted: false };

  const { ownerEmail } = await readSettings(db, "notifications");
  if (!ownerEmail) return { id: row.id, alerted: false };
  await sendEmail(db, { to: ownerEmail, ...errorAlertEmail(row, `${env().APP_URL}/admin/errors`), template: "error-alert" });
  return { id: row.id, alerted: true };
}

/** Called from onRequestError. Never throws: a broken error reporter mustn't make things worse. */
export async function reportServerError(err: unknown, request: { path: string; method: string }, context: { routePath: string; routeType: string }) {
  if (isControlFlow(err)) return;
  try {
    const { getDb } = await import("@/db");
    await recordError(getDb(), {
      source: "server",
      message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      digest: typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "",
      route: `${context.routeType} ${context.routePath}`,
      path: request.path,
      method: request.method,
      stack: err instanceof Error ? err.stack : "",
    });
  } catch (failure) {
    console.error("[errors] could not record an error:", failure);
  }
}
