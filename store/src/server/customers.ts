/**
 * Customer data for the admin panel, and fulfilling deletion requests (DPDP Act).
 * Spend counts confirmed orders that weren't later cancelled or returned.
 */
import { and, eq, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db";
import { addresses, customers, newsletterSubscribers, orders, reviews, sessions } from "@/db/schema";
import { logAudit } from "./audit";

export type CustomerSegment = "NEW" | "REPEAT" | "LAPSED" | "NO_ORDERS";

export async function listCustomers(db: DbOrTx, opts: { q?: string; segment?: string; limit: number; offset: number }) {
  const q = opts.q?.trim().slice(0, 80);
  const like = q ? `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const segmentFilter =
    opts.segment === "repeat"
      ? sql`and stats.orders >= 2`
      : opts.segment === "new"
        ? sql`and stats.orders = 1`
        : opts.segment === "lapsed"
          ? sql`and stats.orders >= 1 and stats.last_order < now() - interval '90 days'`
          : opts.segment === "none"
            ? sql`and coalesce(stats.orders, 0) = 0`
            : opts.segment === "subscribed"
              ? sql`and c.marketing_opt_in`
              : sql``;
  const rows = await db.execute<{
    id: number;
    email: string;
    name: string;
    phone: string;
    marketing_opt_in: boolean;
    created_at: Date;
    deletion_requested_at: Date | null;
    orders: number | null;
    spent: number | null;
    last_order: Date | null;
    total: number;
  }>(sql`
    with stats as (
      select customer_id, count(*)::int as orders, sum(total_paise)::bigint as spent, max(confirmed_at) as last_order
      from orders where confirmed_at is not null and status not in ('CANCELLED','RETURNED_TO_ORIGIN')
      group by customer_id
    )
    select c.id, c.email, c.name, c.phone, c.marketing_opt_in, c.created_at, c.deletion_requested_at,
           stats.orders, stats.spent, stats.last_order, count(*) over()::int as total
    from customers c left join stats on stats.customer_id = c.id
    where c.email not like 'deleted-%@deleted.invalid'
      ${like ? sql`and (c.email ilike ${like} or c.name ilike ${like} or c.phone ilike ${like})` : sql``}
      ${segmentFilter}
    order by coalesce(stats.spent, 0) desc, c.created_at desc
    limit ${opts.limit} offset ${opts.offset}
  `);
  return rows.rows.map((r) => ({ ...r, orders: r.orders ?? 0, spent: Number(r.spent ?? 0), segment: segmentOf(r.orders ?? 0, r.last_order) }));
}

export function segmentOf(orderCount: number, lastOrder: Date | null): CustomerSegment {
  if (orderCount === 0) return "NO_ORDERS";
  if (lastOrder && Date.now() - new Date(lastOrder).getTime() > 90 * 86_400_000) return "LAPSED";
  return orderCount >= 2 ? "REPEAT" : "NEW";
}

/**
 * Fulfils a deletion request: removes the profile's personal data, saved
 * addresses, sessions, newsletter consent and review names. Order and invoice
 * records are kept (unlinked from the account) because tax law requires them.
 */
export async function anonymiseCustomer(db: Database, customerId: number, staffUserId: number) {
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(customers).where(eq(customers.id, customerId)).for("update");
    if (!c) throw new Error("Customer not found.");
    const open = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.customerId, customerId), sql`${orders.status} in ('AWAITING_PAYMENT','AWAITING_COD_CONFIRMATION','CONFIRMED','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERY_FAILED')`));
    if (open.length) throw new Error("This customer has orders in progress. Delete their data once those are delivered or cancelled.");
    await tx.delete(addresses).where(eq(addresses.customerId, customerId));
    await tx.delete(sessions).where(and(eq(sessions.subject, "CUSTOMER"), eq(sessions.subjectId, customerId)));
    await tx.delete(newsletterSubscribers).where(eq(newsletterSubscribers.email, c.email));
    await tx.update(reviews).set({ authorName: "Former customer" }).where(eq(reviews.customerId, customerId));
    await tx.update(orders).set({ customerId: null }).where(eq(orders.customerId, customerId));
    await tx
      .update(customers)
      .set({ email: `deleted-${customerId}@deleted.invalid`, name: "", phone: "", googleSub: null, marketingOptIn: false, marketingOptInAt: null })
      .where(eq(customers.id, customerId));
    await logAudit(tx, { staffUserId, action: "customer.anonymise", entityType: "customer", entityId: customerId });
  });
}
