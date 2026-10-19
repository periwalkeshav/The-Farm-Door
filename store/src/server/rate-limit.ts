/**
 * Fixed-window rate limiting stored in Postgres, so limits hold across every
 * server instance without needing Redis.
 */
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";

export type RateLimitResult = { allowed: boolean; count: number; retryAfterSeconds: number };

export async function hitRateLimit(db: DbOrTx, key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const result = await db.execute<{ count: number; window_start: Date }>(sql`
    insert into rate_limits (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning count, window_start
  `);
  const row = result.rows[0];
  const count = Number(row.count);
  const elapsed = (Date.now() - new Date(row.window_start).getTime()) / 1000;
  return { allowed: count <= limit, count, retryAfterSeconds: Math.max(1, Math.ceil(windowSeconds - elapsed)) };
}

export async function purgeRateLimits(db: DbOrTx, olderThanSeconds = 86_400) {
  await db.execute(sql`delete from rate_limits where window_start < now() - make_interval(secs => ${olderThanSeconds})`);
}

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Too many attempts. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`);
  }
}

/** Throws RateLimitError when any of the given limits is exceeded. */
export async function enforceRateLimits(db: DbOrTx, limits: { key: string; limit: number; windowSeconds: number }[]) {
  for (const l of limits) {
    const r = await hitRateLimit(db, l.key, l.limit, l.windowSeconds);
    if (!r.allowed) throw new RateLimitError(r.retryAfterSeconds);
  }
}
