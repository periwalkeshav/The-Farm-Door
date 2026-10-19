/**
 * Customer sign-in with a one-time code sent by email (no passwords).
 * Google sign-in links to the same customer record by verified email.
 */
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db";
import { customers, loginCodes } from "@/db/schema";
import { hmacHex, randomDigits, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { normalizeEmail } from "@/lib/india";
import { sendEmail } from "../email/send";
import { loginCodeEmail } from "../email/templates";
import { enforceRateLimits } from "../rate-limit";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function codeHash(email: string, code: string) {
  return hmacHex(env().AUTH_SECRET, `login:${email}:${code}`);
}

export async function requestLoginCode(db: Database, rawEmail: string, ip: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  await enforceRateLimits(db, [
    { key: `login-code:email:${email}`, limit: 5, windowSeconds: 3600 },
    { key: `login-code:ip:${ip}`, limit: 30, windowSeconds: 3600 },
  ]);
  const code = randomDigits(6);
  await db.transaction(async (tx) => {
    // Only the newest code is valid.
    await tx.update(loginCodes).set({ consumedAt: new Date() }).where(and(eq(loginCodes.email, email), isNull(loginCodes.consumedAt)));
    await tx.insert(loginCodes).values({ email, codeHash: codeHash(email, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) });
  });
  const rendered = loginCodeEmail(code);
  const sent = await sendEmail(db, { to: email, ...rendered, template: "login-code" });
  if (!sent.ok) throw new Error("We couldn't send the email just now. Please try again in a minute.");
}

export type VerifyResult = { ok: true; customerId: number } | { ok: false; reason: string };

export async function verifyLoginCode(db: Database, rawEmail: string, rawCode: string, ip: string): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\s/g, "");
  await enforceRateLimits(db, [{ key: `login-verify:ip:${ip}`, limit: 50, windowSeconds: 3600 }]);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(loginCodes)
      .where(and(eq(loginCodes.email, email), isNull(loginCodes.consumedAt), gt(loginCodes.expiresAt, sql`now()`)))
      .orderBy(desc(loginCodes.createdAt))
      .limit(1)
      .for("update");
    if (!row) return { ok: false as const, reason: "That code has expired. Please request a new one." };
    if (row.attempts >= MAX_ATTEMPTS) return { ok: false as const, reason: "Too many wrong attempts. Please request a new code." };
    if (!/^\d{6}$/.test(code) || !safeEqual(row.codeHash, codeHash(email, code))) {
      await tx.update(loginCodes).set({ attempts: row.attempts + 1 }).where(eq(loginCodes.id, row.id));
      return { ok: false as const, reason: "That code isn't right. Please check and try again." };
    }
    await tx.update(loginCodes).set({ consumedAt: new Date() }).where(eq(loginCodes.id, row.id));
    const customerId = await upsertCustomerByEmail(tx, email);
    await tx.update(customers).set({ lastLoginAt: new Date() }).where(eq(customers.id, customerId));
    return { ok: true as const, customerId };
  });
}

export async function upsertCustomerByEmail(db: DbOrTx, rawEmail: string, fields: { name?: string; phone?: string } = {}): Promise<number> {
  const email = normalizeEmail(rawEmail);
  const [row] = await db
    .insert(customers)
    .values({ email, name: fields.name ?? "", phone: fields.phone ?? "" })
    .onConflictDoUpdate({
      target: customers.email,
      // Keep existing details; only fill blanks.
      set: {
        name: sql`case when ${customers.name} = '' then excluded.name else ${customers.name} end`,
        phone: sql`case when ${customers.phone} = '' then excluded.phone else ${customers.phone} end`,
      },
    })
    .returning({ id: customers.id });
  return row.id;
}

/** Links (or creates) a customer from a verified Google account. */
export async function customerFromGoogle(db: DbOrTx, profile: { sub: string; email: string; emailVerified: boolean; name: string }) {
  if (!profile.emailVerified) throw new Error("Your Google account email isn't verified.");
  const [bySub] = await db.select({ id: customers.id }).from(customers).where(eq(customers.googleSub, profile.sub));
  if (bySub) return bySub.id;
  const id = await upsertCustomerByEmail(db, profile.email, { name: profile.name });
  await db.update(customers).set({ googleSub: profile.sub, lastLoginAt: new Date() }).where(eq(customers.id, id));
  return id;
}
