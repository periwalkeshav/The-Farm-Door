import { Suspense } from "react";
import { DateRangeFilter } from "@/components/admin/date-range";
import { DataTable, PageHeader, Panel, Td } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { formatINR } from "@/lib/money";
import { resolveRange } from "@/server/date-ranges";
import { EXPORTS } from "@/server/exports";
import { can } from "@/server/permissions";
import * as reports from "@/server/reports";

export const metadata = { title: "Reports & exports" };

export default function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading reports…</p>}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

async function Reports({ searchParams }: { searchParams: PageProps<"/admin/reports">["searchParams"] }) {
  const staff = await requireStaff("reports.operations");
  const sp = await searchParams;
  const r = resolveRange(sp);
  const finance = can(staff.role, "reports.finance");
  const db = getDb();
  const [summary, hsn, ship] = await Promise.all([finance ? reports.salesSummary(db, r.range) : null, finance ? reports.hsnSummary(db, r.range) : [], reports.shippingPerformance(db, r.range)]);
  const qs = new URLSearchParams({ range: r.key, ...(r.key === "custom" ? { from: r.fromDate, to: r.toDate } : {}) }).toString();
  const downloads = Object.entries(EXPORTS).filter(([, e]) => can(staff.role, "exports") && can(staff.role, e.permission));

  return (
    <>
      <PageHeader title="Reports & exports" description={`${r.label} (${r.fromDate} to ${r.toDate}, IST). Exports use the same period unless noted.`} />
      <DateRangeFilter active={r.key} fromDate={r.fromDate} toDate={r.toDate} />

      {summary && (
        <Panel title="Sales" className="mb-6">
          <dl className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
            {[
              ["Confirmed orders", summary.orders.toLocaleString("en-IN")],
              ["Gross sales (items at selling price, incl. GST)", formatINR(summary.grossPaise)],
              ["Coupon discounts", `−${formatINR(summary.discountPaise)}`],
              ["Refunds issued in the period", `−${formatINR(summary.refundsPaise)}`],
              ["COD orders cancelled or returned in the period", `−${formatINR(summary.codReversalsPaise)}`],
              ["Net sales (incl. GST)", formatINR(summary.netPaise)],
              ["Net sales excl. GST (approx.)", formatINR(summary.netExGstPaise)],
              ["Shipping charged to customers", formatINR(summary.shippingPaise)],
              ["COD fees charged", formatINR(summary.codFeesPaise)],
              ["GST included in confirmed orders", formatINR(summary.gstPaise)],
              ["Average order value (order total)", formatINR(summary.aovPaise)],
              ["Customers (new / returning)", `${summary.customers} (${summary.newCustomers} / ${summary.returningCustomers})`],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between border-b border-line/70 py-1">
                <dt className="text-muted">{l}</dt>
                <dd className="font-semibold [font-variant-numeric:tabular-nums]">{v}</dd>
              </div>
            ))}
          </dl>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold text-forest">How these figures are calculated</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li>An order counts as a sale when it&apos;s confirmed: online payment verified with Razorpay, or a cash-on-delivery order confirmed. Unpaid, failed and expired orders never count.</li>
              <li>Refunds and cancellations reduce sales in the period they happen, not the period of the original order.</li>
              <li>For tax filing use the GST sales register below. It&apos;s built from issued invoices (issued when an order is packed), so its totals can differ from sales by confirmation date.</li>
              <li>&quot;Excl. GST&quot; removes GST at the period&apos;s average item rate; the GST register has the exact per-invoice figures.</li>
            </ul>
          </details>
        </Panel>
      )}

      <Panel title="Delivery" className="mb-6">
        <dl className="grid gap-x-8 gap-y-2 text-sm md:grid-cols-2">
          {[
            ["Orders shipped", ship.shipped],
            ["Delivered", ship.delivered],
            ["Returned undelivered (RTO)", `${ship.rto}${ship.rtoRate !== null ? ` (${Math.round(ship.rtoRate * 100)}%)` : ""}`],
            ["Average hours from confirmation to packing", ship.avgHoursToPack ?? "—"],
            ["Average days in transit", ship.avgTransitDays ?? "—"],
            ...(finance ? [["Shipping charged vs courier quotes", `${formatINR(ship.shippingChargedPaise)} vs ${formatINR(ship.courierCostPaise)}`]] : []),
          ].map(([l, v]) => (
            <div key={String(l)} className="flex justify-between border-b border-line/70 py-1">
              <dt className="text-muted">{l}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      {finance && (
        <div className="mb-6">
          <h2 className="mb-3 font-sans text-base font-bold text-forest">HSN-wise summary (from invoices)</h2>
          <DataTable head={["HSN/SAC", "GST %", "Qty", "Taxable value", "CGST", "SGST", "IGST", "Total"]} empty={hsn.length === 0}>
            {hsn.map((h) => (
              <tr key={`${h.hsn}-${h.rate_bp}`}>
                <Td className="font-mono">{h.hsn}</Td>
                <Td>{h.rate_bp / 100}%</Td>
                <Td>{h.quantity}</Td>
                <Td>{formatINR(h.taxable)}</Td>
                <Td>{formatINR(h.cgst)}</Td>
                <Td>{formatINR(h.sgst)}</Td>
                <Td>{formatINR(h.igst)}</Td>
                <Td className="font-semibold">{formatINR(h.total)}</Td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      {downloads.length > 0 && (
        <Panel title="Download as CSV (opens in Excel or Google Sheets)">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {downloads.map(([kind, e]) => (
              <li key={kind}>
                <a href={`/admin/export/${kind}${e.dated ? `?${qs}` : ""}`} className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm font-semibold text-forest hover:border-forest">
                  {e.title}
                  <span className="text-xs font-normal text-muted">{e.dated ? "for this period" : "current"}</span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
