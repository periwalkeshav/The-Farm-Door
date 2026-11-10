import { desc, ilike } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, DataTable, PageHeader, Td } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { emailLog } from "@/db/schema";
import { env } from "@/lib/env";

export const metadata = { title: "Email log" };

export default function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Emails searchParams={searchParams} />
    </Suspense>
  );
}

async function Emails({ searchParams }: { searchParams: PageProps<"/admin/emails">["searchParams"] }) {
  await requireStaff("settings.manage");
  const sp = await searchParams;
  const to = typeof sp.to === "string" ? sp.to.trim().slice(0, 100) : "";
  const rows = await getDb()
    .select({ id: emailLog.id, to: emailLog.to, subject: emailLog.subject, template: emailLog.template, status: emailLog.status, error: emailLog.error, attachments: emailLog.attachments, orderId: emailLog.orderId, createdAt: emailLog.createdAt })
    .from(emailLog)
    .where(to ? ilike(emailLog.to, `%${to.replace(/[%_\\]/g, (m) => `\\${m}`)}%`) : undefined)
    .orderBy(desc(emailLog.createdAt))
    .limit(200);
  const logOnly = env().EMAIL_TRANSPORT === "log";
  return (
    <>
      <PageHeader
        title="Email log"
        description={logOnly ? "Test mode: emails are recorded here instead of being sent. Open one to see exactly what the customer would receive (including sign-in codes)." : "Every email the store sent, with failures. Message contents aren't stored once real sending is on."}
      />
      <form className="mb-4 flex gap-2">
        <input name="to" defaultValue={to} placeholder="Filter by recipient" aria-label="Filter by recipient" className="field w-72 py-2" />
        <button type="submit" className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-ivory">
          Filter
        </button>
      </form>
      <DataTable head={["Sent", "To", "Subject", "Status"]} empty={rows.length === 0}>
        {rows.map((e) => (
          <tr key={e.id}>
            <Td className="whitespace-nowrap text-muted">{e.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" })}</Td>
            <Td>{e.to}</Td>
            <Td>
              {e.status === "LOGGED" ? (
                <Link href={`/admin/emails/${e.id}`} className="font-semibold text-forest underline">
                  {e.subject}
                </Link>
              ) : (
                e.subject
              )}
              {e.orderId && (
                <Link href={`/admin/orders/${e.orderId}`} className="ml-2 inline-block py-1 text-xs text-muted underline">
                  order
                </Link>
              )}
              {e.attachments.length > 0 && <span className="block text-xs text-muted">Attached: {e.attachments.join(", ")}</span>}
              {e.error && <span className="block text-xs text-chilli">{e.error}</span>}
            </Td>
            <Td>
              <Badge tone={e.status === "FAILED" ? "bad" : e.status === "SENT" ? "good" : "neutral"}>{e.status.toLowerCase()}</Badge>
            </Td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
