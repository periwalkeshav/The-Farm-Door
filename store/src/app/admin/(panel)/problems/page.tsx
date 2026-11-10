import Link from "next/link";
import { Suspense } from "react";
import { ProblemActions } from "@/components/admin/problem-forms";
import { Badge, PageHeader } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { formatINR } from "@/lib/money";
import { can } from "@/server/permissions";
import { listProblemReports, PROBLEM_KIND_LABELS, PROBLEM_STATUS_LABELS, problemCounts, type ProblemStatus } from "@/server/problems";

export const metadata = { title: "Problem reports" };

const STATUSES = Object.keys(PROBLEM_STATUS_LABELS) as ProblemStatus[];

function fmt(d: Date) {
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export default function ProblemsPage({ searchParams }: PageProps<"/admin/problems">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading problem reports…</p>}>
      <Problems searchParams={searchParams} />
    </Suspense>
  );
}

async function Problems({ searchParams }: { searchParams: PageProps<"/admin/problems">["searchParams"] }) {
  const staff = await requireStaff("orders.manage");
  const sp = await searchParams;
  const status: ProblemStatus = STATUSES.includes(sp.status as ProblemStatus) ? (sp.status as ProblemStatus) : "OPEN";
  const db = getDb();
  const [rows, counts] = await Promise.all([listProblemReports(db, status), problemCounts(db)]);
  return (
    <>
      <PageHeader
        title="Problem reports"
        description="Customers report damaged, wrong, expired or missing items here within 48 hours of delivery, with photos. Send a free replacement, refund, or reply and close. The customer is emailed each time."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/problems?status=${s}`} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${status === s ? "border-forest bg-forest text-ivory" : "border-line bg-paper text-forest"}`}>
            {PROBLEM_STATUS_LABELS[s]} ({counts[s] ?? 0})
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-line bg-paper p-6 text-sm text-muted">No reports here.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map(({ report, order, photoIds, items, replacement, refundablePaise }) => {
            const affected = items.filter((i) => report.orderItemIds.includes(i.id));
            return (
              <li key={report.id} className="rounded-2xl border border-line bg-paper p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-forest">
                      <Link href={`/admin/orders/${order.id}`} className="hover:underline">
                        Order {order.orderNumber}
                      </Link>{" "}
                      <Badge tone="warn">{PROBLEM_KIND_LABELS[report.kind]}</Badge>
                    </p>
                    <p className="mt-1 text-sm">
                      {order.shipName} ·{" "}
                      <a href={`tel:+91${order.shipPhone}`} className="underline">
                        {order.shipPhone}
                      </a>{" "}
                      ·{" "}
                      <a href={`mailto:${order.email}`} className="underline">
                        {order.email}
                      </a>
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Reported {fmt(report.createdAt)}
                      {order.deliveredAt && <> · delivered {fmt(order.deliveredAt)}</>}
                      {" · "}
                      {order.paymentMethod === "COD" ? "Cash on delivery" : "Online payment"}
                    </p>
                  </div>
                  {status !== "OPEN" && (
                    <div className="text-right text-sm">
                      <Badge tone={report.status === "CLOSED" ? "neutral" : "good"}>{PROBLEM_STATUS_LABELS[report.status]}</Badge>
                      {report.resolvedAt && <p className="mt-1 text-xs text-muted">{fmt(report.resolvedAt)}</p>}
                    </div>
                  )}
                </div>
                <p className="mt-3 text-sm font-semibold">Items: {affected.map((i) => `${i.productName} (${i.variantTitle}) × ${i.quantity}`).join(", ") || "—"}</p>
                <p className="mt-2 max-w-3xl rounded-xl bg-ivory p-3 text-sm whitespace-pre-line">{report.description}</p>
                {photoIds.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2" aria-label="Customer photos">
                    {photoIds.map((id, n) => (
                      <li key={id}>
                        <a href={`/admin/problem-photos/${id}`} target="_blank" rel="noopener" className="block size-28 overflow-hidden rounded-xl border border-line hover:border-forest">
                          {/* eslint-disable-next-line @next/next/no-img-element -- private staff-only image */}
                          <img src={`/admin/problem-photos/${id}`} alt={`Customer photo ${n + 1} (opens full size)`} className="size-full object-cover" loading="lazy" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {report.status === "OPEN" ? (
                  <div className="mt-4">
                    <ProblemActions
                      reportId={report.id}
                      items={items.map((i) => ({ id: i.id, label: `${i.productName} (${i.variantTitle})`, quantity: i.quantity, lineTotalPaise: i.lineTotalPaise, affected: report.orderItemIds.includes(i.id) }))}
                      refundablePaise={refundablePaise}
                      paymentMethod={order.paymentMethod}
                      canRefund={can(staff.role, "orders.refund")}
                      staffNote={report.staffNote}
                    />
                  </div>
                ) : (
                  <div className="mt-3 space-y-1 text-sm">
                    {replacement && (
                      <p>
                        Replacement:{" "}
                        <Link href={`/admin/orders/${replacement.id}`} className="font-semibold text-forest underline">
                          order {replacement.orderNumber}
                        </Link>
                      </p>
                    )}
                    {report.refundPaise !== null && <p>Refunded {formatINR(report.refundPaise)}</p>}
                    {report.resolutionNote && <p className="text-muted">Told the customer: {report.resolutionNote}</p>}
                    {report.staffNote && <p className="text-muted">Internal note: {report.staffNote}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
