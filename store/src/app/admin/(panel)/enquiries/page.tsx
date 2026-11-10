import Link from "next/link";
import { Suspense } from "react";
import { EnquiryUpdateForm } from "@/components/admin/enquiry-forms";
import { PageHeader } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { ENQUIRY_STATUS_LABELS, enquiryCounts, listEnquiries, type EnquiryStatus } from "@/server/enquiries";

export const metadata = { title: "Business enquiries" };

export default function EnquiriesPage({ searchParams }: PageProps<"/admin/enquiries">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading enquiries…</p>}>
      <Enquiries searchParams={searchParams} />
    </Suspense>
  );
}

async function Enquiries({ searchParams }: { searchParams: PageProps<"/admin/enquiries">["searchParams"] }) {
  await requireStaff("enquiries.manage");
  const sp = await searchParams;
  const status: EnquiryStatus = sp.status === "CONTACTED" || sp.status === "CLOSED" ? sp.status : "NEW";
  const db = getDb();
  const [rows, counts] = await Promise.all([listEnquiries(db, status), enquiryCounts(db)]);
  return (
    <>
      <PageHeader title="Business enquiries" description="Bulk and business order requests from the “Bulk orders” page. Reply by phone or email, then update the status so the team knows where each one stands." />
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(ENQUIRY_STATUS_LABELS) as EnquiryStatus[]).map((s) => (
          <Link key={s} href={`/admin/enquiries?status=${s}`} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${status === s ? "border-forest bg-forest text-ivory" : "border-line bg-paper text-forest"}`}>
            {ENQUIRY_STATUS_LABELS[s]} ({counts[s] ?? 0})
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-line bg-paper p-6 text-sm text-muted">No enquiries here.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((e) => (
            <li key={e.id} className="rounded-2xl border border-line bg-paper p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-forest">
                    {e.name}
                    {e.businessName && <span className="font-normal text-muted"> · {e.businessName}</span>}
                  </p>
                  <p className="mt-1 text-sm">
                    <a href={`tel:+91${e.phone}`} className="underline">
                      {e.phone}
                    </a>
                    {" · "}
                    <a href={`mailto:${e.email}`} className="underline">
                      {e.email}
                    </a>
                    {e.city && <> · {e.city}</>}
                    {e.gstin && <> · GSTIN {e.gstin}</>}
                  </p>
                </div>
                <p className="text-xs text-muted">{e.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</p>
              </div>
              <p className="mt-3 max-w-3xl rounded-xl bg-ivory p-3 text-sm whitespace-pre-line">{e.requirement}</p>
              <div className="mt-4">
                <EnquiryUpdateForm id={e.id} status={e.status} staffNote={e.staffNote} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
