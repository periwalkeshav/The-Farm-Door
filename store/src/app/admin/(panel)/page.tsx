import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ColumnChart, TrendChart } from "@/components/admin/charts";
import { DateRangeFilter } from "@/components/admin/date-range";
import { BarTable, Panel, PageHeader, StatTile } from "@/components/admin/ui";
import { Notice } from "@/components/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { formatINR } from "@/lib/money";
import { resolveRange } from "@/server/date-ranges";
import { STATUS_LABELS } from "@/server/orders/common";
import { staffTwoStepRequired } from "@/lib/env";
import { recoveryCodesLeft } from "@/server/auth/recovery-codes";
import { can } from "@/server/permissions";
import * as reports from "@/server/reports";
import { variantTitle } from "@/server/catalog/variant-title";
import { missingStoreDetails, readAllSettings } from "@/server/settings";
import { waitingForRestock } from "@/server/stock-alerts";

export const metadata = { title: "Dashboard" };

export default function DashboardPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading dashboard…</p>}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const staff = await requireStaff();
  if (!can(staff.role, "dashboard.view")) redirect("/admin/orders");
  const finance = can(staff.role, "reports.finance");
  const sp = await searchParams;
  const r = resolveRange(sp);
  const prev = reports.previousRange(r.range);
  const db = getDb();

  const [cur, before, series, prevSeries, top, cats, statuses, pay, coupons, ship, cod, low, queue, settings, waiting, codesLeft] = await Promise.all([
    reports.salesSummary(db, r.range),
    reports.salesSummary(db, prev),
    reports.salesSeries(db, r.range, r.unit),
    reports.salesSeries(db, prev, r.unit),
    reports.topProducts(db, r.range, 8),
    reports.revenueByCategory(db, r.range),
    reports.statusDistribution(db, r.range),
    reports.paymentStats(db, r.range),
    reports.couponUsage(db, r.range),
    reports.shippingPerformance(db, r.range),
    reports.codOutstanding(db),
    reports.lowStock(db),
    reports.workQueue(db),
    readAllSettings(db),
    waitingForRestock(db),
    recoveryCodesLeft(db, staff.id),
  ]);
  const missing = missingStoreDetails(settings.store);
  const trend = series.map((p, i) => ({ bucket: p.bucket, value: p.netPaise, compare: prevSeries[i]?.netPaise }));
  const ordersTrend = series.map((p) => ({ bucket: p.bucket, value: p.orders }));

  return (
    <>
      <PageHeader title="Dashboard" description={`${r.label} · compared with the previous ${r.label === "Today" ? "day" : "period of the same length"}. Times in IST.`} />
      {codesLeft === 0 && staff.totpEnabled && staffTwoStepRequired() && (
        <Notice tone="warn" className="mb-6">
          Get your 2-step verification backup codes, so a lost phone can&apos;t lock you out.{" "}
          <Link href="/admin/account/backup-codes" className="font-semibold underline">
            Get backup codes
          </Link>
        </Notice>
      )}
      {missing.length > 0 && can(staff.role, "settings.manage") && (
        <Notice tone="warn" className="mb-6">
          Before launch, add these in{" "}
          <Link href="/admin/settings" className="font-semibold underline">
            Settings
          </Link>
          : {missing.join(", ")}.
        </Notice>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {[
          { label: "To pack", value: queue.to_pack, href: "/admin/orders?status=CONFIRMED" },
          { label: "Problems reported by customers", value: queue.open_problems, href: "/admin/problems" },
          { label: "COD awaiting customer confirmation", value: queue.awaiting_cod, href: "/admin/orders?status=AWAITING_COD_CONFIRMATION" },
          { label: "Awaiting online payment", value: queue.awaiting_payment, href: "/admin/orders?status=AWAITING_PAYMENT" },
          { label: "Delivery problems", value: queue.delivery_failed, href: "/admin/orders?status=DELIVERY_FAILED" },
          { label: "Reviews to moderate", value: queue.pending_reviews, href: "/admin/reviews" },
          { label: "New business enquiries", value: queue.new_enquiries, href: "/admin/enquiries" },
        ].map((q) => (
          <Link key={q.label} href={q.href} className="rounded-2xl border border-line bg-paper p-4 hover:border-forest">
            <p className="text-xs font-semibold text-muted">{q.label}</p>
            <p className={`mt-1 text-2xl font-bold ${q.value > 0 ? "text-forest" : "text-muted"}`}>{q.value}</p>
          </Link>
        ))}
      </div>

      {waiting.length > 0 && (
        <Panel title="Customers waiting for a restock" className="mb-6">
          <ul className="divide-y divide-line text-sm">
            {waiting.map((w) => (
              <li key={`${w.productId}-${JSON.stringify(w.optionValues)}`} className="flex justify-between gap-4 py-2">
                <Link href={`/admin/products/${w.productId}`} className="font-semibold text-forest hover:underline">
                  {w.productName}
                  <span className="font-normal text-muted"> · {variantTitle(w.options, w.optionValues)}</span>
                </Link>
                <span className="tabular-nums">
                  {w.waiting} waiting
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">They&apos;re emailed automatically when stock is back.</p>
        </Panel>
      )}

      <DateRangeFilter active={r.key} fromDate={r.fromDate} toDate={r.toDate} />

      {finance ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Net sales (incl. GST)" value={formatINR(cur.netPaise)} current={cur.netPaise} previous={before.netPaise} money hint={`${formatINR(cur.netExGstPaise)} excl. GST (approx.)`} />
          <StatTile label="Confirmed orders" value={cur.orders.toLocaleString("en-IN")} current={cur.orders} previous={before.orders} />
          <StatTile label="Average order value" value={formatINR(cur.aovPaise)} current={cur.aovPaise} previous={before.aovPaise} money />
          <StatTile label="Customers" value={cur.customers.toLocaleString("en-IN")} current={cur.customers} previous={before.customers} hint={`${cur.newCustomers} new · ${cur.returningCustomers} returning`} />
        </div>
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Confirmed orders" value={cur.orders.toLocaleString("en-IN")} current={cur.orders} previous={before.orders} />
          <StatTile label="Customers" value={cur.customers.toLocaleString("en-IN")} hint={`${cur.newCustomers} new · ${cur.returningCustomers} returning`} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {finance && (
            <Panel title="Item sales after discounts">
              <TrendChart data={trend} unit={r.unit} money compareLabel="previous period" />
              <p className="mt-2 flex items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 rounded bg-[#23774a]" /> This period
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 rounded bg-[#b9b4a8]" /> Previous period
                </span>
              </p>
            </Panel>
          )}
          <Panel title="Confirmed orders">
            <ColumnChart data={ordersTrend} unit={r.unit} />
          </Panel>
          {finance && (
            <Panel title="Sales breakdown" action={<Link href="/admin/reports" className="text-sm font-semibold text-forest underline">Definitions & exports</Link>}>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {[
                  ["Gross sales (items, incl. GST)", cur.grossPaise],
                  ["Discounts", -cur.discountPaise],
                  ["Refunds (online & manual)", -cur.refundsPaise],
                  ["COD orders cancelled/returned", -cur.codReversalsPaise],
                  ["Net sales (incl. GST)", cur.netPaise],
                  ["Shipping collected", cur.shippingPaise],
                  ["COD fees collected", cur.codFeesPaise],
                  ["GST in confirmed orders", cur.gstPaise],
                  ["Payment gateway fees (incl. GST)", -pay.gatewayFeesPaise],
                  ["Courier cost (quoted, shipped orders)", -ship.courierCostPaise],
                ].map(([label, v]) => (
                  <div key={label as string} className="flex justify-between border-b border-line/70 py-1">
                    <dt className="text-muted">{label}</dt>
                    <dd className="font-semibold [font-variant-numeric:tabular-nums]">{(v as number) < 0 ? `−${formatINR(-(v as number))}` : formatINR(v as number)}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          )}
          <Panel title="Bestselling products">
            <BarTable rows={top.map((t) => ({ label: t.name, value: finance ? t.revenuePaise : t.units, sub: `${t.units} sold` }))} valueLabel={finance ? "Revenue" : "Units"} format={(v) => (finance ? formatINR(v) : `${v}`)} />
          </Panel>
        </div>

        <div className="space-y-6">
          {finance && (
            <Panel title="Sales by category">
              <BarTable rows={cats.map((c) => ({ label: c.name, value: c.revenuePaise, sub: `${c.units} sold` }))} valueLabel="Revenue" format={formatINR} />
            </Panel>
          )}
          <Panel title="Orders placed by current status">
            {statuses.length ? (
              <ul className="space-y-1.5 text-sm">
                {statuses.map((s) => (
                  <li key={s.status} className="flex justify-between">
                    <Link href={`/admin/orders?status=${s.status}`} className="hover:underline">
                      {STATUS_LABELS[s.status as keyof typeof STATUS_LABELS] ?? s.status}
                    </Link>
                    <span className="font-semibold">{s.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No orders placed in this period.</p>
            )}
          </Panel>
          {finance && (
            <Panel title="Payments">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Online payment success rate</dt>
                  <dd className="font-semibold">{pay.successRate === null ? "—" : `${Math.round(pay.successRate * 100)}%`}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Failed payment attempts</dt>
                  <dd className="font-semibold">{pay.failedAttempts}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Prepaid orders never paid</dt>
                  <dd className="font-semibold">{pay.expiredUnpaid}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">COD orders never confirmed</dt>
                  <dd className="font-semibold">{pay.codUnconfirmed}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Refunds issued</dt>
                  <dd className="font-semibold">
                    {pay.refunds} · {formatINR(pay.refundsPaise)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Cancelled after confirmation</dt>
                  <dd className="font-semibold">{pay.cancelledAfterConfirm}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">COD awaiting collection (now)</dt>
                  <dd className="font-semibold whitespace-nowrap">
                    {cod.count} · {formatINR(cod.amountPaise)}
                  </dd>
                </div>
              </dl>
            </Panel>
          )}
          <Panel title="Delivery">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Shipped / delivered</dt>
                <dd className="font-semibold">
                  {ship.shipped} / {ship.delivered}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Average time to pack</dt>
                <dd className="font-semibold">{ship.avgHoursToPack === null ? "—" : `${ship.avgHoursToPack} h`}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Average transit time</dt>
                <dd className="font-semibold">{ship.avgTransitDays === null ? "—" : `${ship.avgTransitDays} days`}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Returned undelivered (RTO)</dt>
                <dd className="font-semibold">
                  {ship.rto}
                  {ship.rtoRate !== null ? ` · ${Math.round(ship.rtoRate * 100)}%` : ""}
                </dd>
              </div>
            </dl>
          </Panel>
          {finance && coupons.length > 0 && (
            <Panel title="Coupon usage">
              <ul className="space-y-1.5 text-sm">
                {coupons.map((c) => (
                  <li key={c.code} className="flex justify-between">
                    <span className="font-semibold">{c.code}</span>
                    <span>
                      {c.uses} uses · −{formatINR(c.discountPaise)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Low stock" action={<Link href="/admin/inventory" className="text-sm font-semibold text-forest underline">Inventory</Link>}>
            {low.length ? (
              <ul className="space-y-1.5 text-sm">
                {low.slice(0, 10).map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <Link href={`/admin/inventory/${i.id}`} className="truncate hover:underline">
                      {i.name}
                    </Link>
                    <span className={`shrink-0 font-semibold ${i.available <= 0 ? "text-chilli" : ""}`}>
                      {i.available <= 0 ? "Out of stock" : `${i.available} ${i.unit === "GRAM" ? "g" : "left"}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing below its alert level.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
