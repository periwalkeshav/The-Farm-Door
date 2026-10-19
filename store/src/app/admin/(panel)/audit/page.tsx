import { desc, eq } from "drizzle-orm";
import { Suspense } from "react";
import { DataTable, PageHeader, Td } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { auditLogs, staffUsers } from "@/db/schema";

export const metadata = { title: "Audit log" };

export default function AuditPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Audit />
    </Suspense>
  );
}

async function Audit() {
  await requireStaff("audit.view");
  const rows = await getDb()
    .select({ a: auditLogs, name: staffUsers.name })
    .from(auditLogs)
    .leftJoin(staffUsers, eq(staffUsers.id, auditLogs.staffUserId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(300);
  return (
    <>
      <PageHeader title="Audit log" description="Who did what in the admin panel: sign-ins, refunds, price and stock changes, settings and staff changes. Entries can't be edited." />
      <DataTable head={["When", "Who", "Action", "Item", "Details"]} empty={rows.length === 0}>
        {rows.map(({ a, name }) => (
          <tr key={a.id}>
            <Td className="whitespace-nowrap text-muted">{a.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</Td>
            <Td>{name ?? "System"}</Td>
            <Td className="font-mono text-xs">{a.action}</Td>
            <Td className="text-xs text-muted">
              {a.entityType} {a.entityId}
            </Td>
            <Td className="max-w-md font-mono text-xs break-all text-muted">{Object.keys(a.data as object).length ? JSON.stringify(a.data) : ""}</Td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
