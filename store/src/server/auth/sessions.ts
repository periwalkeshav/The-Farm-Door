/**
 * Database-backed sessions. The cookie holds a random token; the database only
 * stores its SHA-256 hash, so a database leak does not expose live sessions.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { sessions } from "@/db/schema";
import { randomToken, sha256Hex } from "@/lib/crypto";

export type SessionSubject = "CUSTOMER" | "STAFF";

export const SESSION_POLICY = {
  CUSTOMER: { maxAgeMs: 30 * 24 * 60 * 60 * 1000, idleMs: null as number | null },
  STAFF: { maxAgeMs: 12 * 60 * 60 * 1000, idleMs: 2 * 60 * 60 * 1000 as number | null },
} as const;

/** A partially signed-in staff session (password OK, 2-step code pending) expires quickly. */
const MFA_PENDING_MS = 10 * 60 * 1000;

export type SessionRecord = typeof sessions.$inferSelect;

export async function createSession(
  db: DbOrTx,
  subject: SessionSubject,
  subjectId: number,
  opts: { mfaPending?: boolean; ip?: string; userAgent?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const policy = SESSION_POLICY[subject];
  const expiresAt = new Date(Date.now() + (opts.mfaPending ? MFA_PENDING_MS : policy.maxAgeMs));
  await db.insert(sessions).values({
    id: sha256Hex(token),
    subject,
    subjectId,
    mfaPending: opts.mfaPending ?? false,
    expiresAt,
    ip: (opts.ip ?? "").slice(0, 100),
    userAgent: (opts.userAgent ?? "").slice(0, 300),
  });
  return { token, expiresAt };
}

/** Returns the session if the token is valid for this subject type, refreshing its last-seen time. */
export async function validateSession(db: DbOrTx, token: string, subject: SessionSubject): Promise<SessionRecord | null> {
  if (!token || token.length > 100) return null;
  const id = sha256Hex(token);
  const [session] = await db.select().from(sessions).where(and(eq(sessions.id, id), eq(sessions.subject, subject)));
  if (!session) return null;
  const now = Date.now();
  const idle = SESSION_POLICY[subject].idleMs;
  if (session.expiresAt.getTime() <= now || (idle !== null && now - session.lastSeenAt.getTime() > idle)) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  // Only write when last-seen is a minute old, to avoid a write on every request.
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await db.update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.id, id));
  }
  return session;
}

/** Upgrades a staff session after the 2-step code is verified. Issues a fresh token (prevents fixation). */
export async function completeMfa(db: DbOrTx, oldToken: string, opts: { ip?: string; userAgent?: string }) {
  const old = await validateSession(db, oldToken, "STAFF");
  if (!old || !old.mfaPending) return null;
  await db.delete(sessions).where(eq(sessions.id, old.id));
  return createSession(db, "STAFF", old.subjectId, { ip: opts.ip, userAgent: opts.userAgent });
}

export async function deleteSessionByToken(db: DbOrTx, token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256Hex(token)));
}

export async function deleteAllSessions(db: DbOrTx, subject: SessionSubject, subjectId: number) {
  await db.delete(sessions).where(and(eq(sessions.subject, subject), eq(sessions.subjectId, subjectId)));
}

export async function purgeExpiredSessions(db: DbOrTx) {
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`));
}
