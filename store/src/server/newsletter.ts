/**
 * Newsletter list. Sign-ups come from the shop footer, checkout (unticked by
 * default) and an import of the coming-soon page's list. Campaigns are sent from
 * an email-marketing tool using the exported CSV, which honours unsubscribes.
 */
import { inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { emailOptOuts, newsletterSubscribers } from "@/db/schema";
import { parseCsv } from "@/lib/csv";
import { normalizeEmail } from "@/lib/india";

/** People from the coming-soon page agreed to launch news only, not regular offers. */
export const COMING_SOON_SOURCE = "coming-soon (launch news only)";

const EMAIL = /^[^@\s"'<>]+@[^@\s"'<>]+\.[a-z]{2,}$/i;

/** Pulls email addresses (and sign-up dates when present) out of a CSV such as Netlify's form export. */
export function emailsFromCsv(text: string): { valid: { email: string; consentedAt: Date | null }[]; invalid: number } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { valid: [], invalid: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  let emailCol = header.findIndex((h) => h.includes("email"));
  const dateCol = header.findIndex((h) => /created|date|submitted|time/.test(h));
  let body = rows.slice(1);
  if (emailCol === -1) {
    // No header: use the first column that holds an email address.
    emailCol = rows[0].findIndex((c) => EMAIL.test(c.trim()));
    body = rows;
    if (emailCol === -1) return { valid: [], invalid: rows.length };
  }
  const seen = new Map<string, Date | null>();
  let invalid = 0;
  for (const r of body) {
    const raw = (r[emailCol] ?? "").trim();
    if (!EMAIL.test(raw)) {
      invalid++;
      continue;
    }
    const when = dateCol > -1 ? new Date(r[dateCol] ?? "") : null;
    seen.set(normalizeEmail(raw), when && !Number.isNaN(when.getTime()) ? when : null);
  }
  return { valid: [...seen].map(([email, consentedAt]) => ({ email, consentedAt })), invalid };
}

/** Adds new addresses only. Never re-adds someone who unsubscribed or opted out. */
export async function importSubscribers(db: DbOrTx, people: { email: string; consentedAt: Date | null }[], source: string) {
  if (people.length === 0) return { added: 0, skipped: 0 };
  const emails = people.map((p) => p.email);
  const optedOut = new Set((await db.select({ email: emailOptOuts.email }).from(emailOptOuts).where(inArray(emailOptOuts.email, emails))).map((r) => r.email));
  const fresh = people.filter((p) => !optedOut.has(p.email));
  let added = 0;
  for (let i = 0; i < fresh.length; i += 500) {
    const batch = fresh.slice(i, i + 500).map((p) => ({ email: p.email, source, consentedAt: p.consentedAt ?? new Date() }));
    const inserted = await db.insert(newsletterSubscribers).values(batch).onConflictDoNothing().returning({ email: newsletterSubscribers.email });
    added += inserted.length;
  }
  return { added, skipped: people.length - added };
}

export async function subscriberCounts(db: DbOrTx) {
  return db
    .select({ source: newsletterSubscribers.source, n: sql<number>`count(*)::int` })
    .from(newsletterSubscribers)
    .where(isNull(newsletterSubscribers.unsubscribedAt))
    .groupBy(newsletterSubscribers.source)
    .orderBy(sql`count(*) desc`);
}

export async function unsubscribedCount(db: DbOrTx) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(newsletterSubscribers).where(isNotNull(newsletterSubscribers.unsubscribedAt));
  return row?.n ?? 0;
}
