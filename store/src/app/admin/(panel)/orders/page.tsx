import { and, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, DataTable, PageHeader, statusTone, Td } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { formatINR } from "@/lib/money";
import { PAYMENT_STATUS_LABELS, STATUS_LABELS } from "@/server/orders/common";
import { can } from "@/server/permissions";
import { istDayStart, addDays } from "@/server/reports";

export const metadata = { title: "Orders" };
const PAGE_SIZE = 50;

export default function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading orders…</p>}>
      <OrdersList searchParams={searchParams} />
    </Suspense>
  );
}

function str(v: string | string[] | undefined) {
  return typeof v === "string" ? v.trim() : "";
}

async function OrdersList({ searchParams }: { searchParams: PageProps<"/admin/orders">["searchParams"] }) {
  const staff = await requireStaff("orders.view");
  const sp = await searchParams;
  const status = str(sp.status);
  const method = str(sp.method);
  const q = str(sp.q).slice(0, 80);
  const from = str(sp.from);
  const to = str(sp.to);
  const page = Math.max(1, Number(sp.page) || 1);
  const seeCustomer = can(staff.role, "orders.customerDetails");

  const where: (SQL | undefined)[] = [];
  if (status && status in STATUS_LABELS) where.push(eq(orders.status, status as keyof typeof STATUS_LABELS));
  if (method === "COD" || method === "PREPAID") where.push(eq(orders.paymentMethod, method));
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) where.push(gte(orders.placedAt, istDayStart(from)));
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) where.push(lt(orders.placedAt, istDayStart(addDays(to, 1))));
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    where.push(or(ilike(orders.orderNumber, like), ilike(orders.shipName, like), ilike(orders.shipPhone, like), seeCustomer ? ilike(orders.email, like) : undefined, ilike(orders.shipPincode, like)));
  }
  // Packing staff only see orders that are theirs to work on.
  if (!can(staff.role, "orders.manage")) where.push(sql`${orders.status} in ('CONFIRMED','PACKED','SHIPPED')`);
  const condition = and(...where);
  const db = getDb();
  const [{ total }] = await db.select({ total: count() }).from(orders).where(condition);
  const rows = await db
    .select()
    .from(orders)
    .where(condition)
    .orderBy(desc(orders.placedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ...(status && { status }), ...(method && { method }), ...(q && { q }), ...(from && { from }), ...(to && { to }), ...over });
    return `?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Orders"
        description={`${total} order${total === 1 ? "" : "s"}`}
        actions={
          can(staff.role, "exports") ? (
            <a href={`/admin/export/orders${qs({})}`} className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest">
              Export CSV
            </a>
          ) : null
        }
      />
      <form className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="o-q" className="label">
            Search
          </label>
          <input id="o-q" name="q" defaultValue={q} placeholder="Order no., name, phone, pincode" className="field w-64 py-2" />
        </div>
        <div>
          <label htmlFor="o-status" className="label">
            Status
          </label>
          <select id="o-status" name="status" defaultValue={status} className="field w-auto py-2">
            <option value="">All</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="o-method" className="label">
            Payment
          </label>
          <select id="o-method" name="method" defaultValue={method} className="field w-auto py-2">
            <option value="">All</option>
            <option value="PREPAID">Online</option>
            <option value="COD">Cash on delivery</option>
          </select>
        </div>
        <div>
          <label htmlFor="o-from" className="label">
            Placed from
          </label>
          <input id="o-from" type="date" name="from" defaultValue={from} className="field w-auto py-2" />
        </div>
        <div>
          <label htmlFor="o-to" className="label">
            to
          </label>
          <input id="o-to" type="date" name="to" defaultValue={to} className="field w-auto py-2" />
        </div>
        <button type="submit" className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory">
          Filter
        </button>
        <Link href="/admin/orders" className="py-2.5 text-sm font-semibold text-muted underline">
          Clear
        </Link>
      </form>
      <DataTable head={["Order", "Placed", "Customer", "Status", "Payment", "Total"]} empty={rows.length === 0}>
        {rows.map((o) => (
          <tr key={o.id} className="hover:bg-ivory">
            <Td>
              <Link href={`/admin/orders/${o.id}`} className="font-bold text-forest hover:underline">
                {o.orderNumber}
              </Link>
            </Td>
            <Td className="whitespace-nowrap text-muted">{o.placedAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</Td>
            <Td>
              <span className="font-semibold">{o.shipName}</span>
              <span className="block text-xs text-muted">
                {seeCustomer ? o.email : ""} {o.shipCity} {o.shipPincode}
              </span>
            </Td>
            <Td>
              <Badge tone={statusTone(o.status)}>{STATUS_LABELS[o.status]}</Badge>
            </Td>
            <Td className="whitespace-nowrap">
              {o.paymentMethod === "COD" ? "COD" : "Online"}
              <span className="block text-xs text-muted">{PAYMENT_STATUS_LABELS[o.paymentStatus]}</span>
            </Td>
            <Td className="font-semibold whitespace-nowrap">{formatINR(o.totalPaise)}</Td>
          </tr>
        ))}
      </DataTable>
      {pages > 1 && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link href={qs({ page: String(page - 1) })} className="font-semibold text-forest underline">
              ← Newer
            </Link>
          )}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link href={qs({ page: String(page + 1) })} className="font-semibold text-forest underline">
              Older →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
