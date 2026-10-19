import { asc } from "drizzle-orm";
import { Suspense } from "react";
import { NewStaffForm, StaffRowActions } from "@/components/admin/staff-forms";
import { Badge, DataTable, PageHeader, Panel, Td } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { staffUsers } from "@/db/schema";
import { ROLE_LABELS, ROLE_PERMISSIONS } from "@/server/permissions";

export const metadata = { title: "Staff" };

const ROLE_SUMMARY: Record<string, string> = {
  OWNER: "Everything, including money reports, refunds, settings and staff.",
  MANAGER: "Orders, products, stock, customers, coupons and reviews. No money reports, refunds, settings or staff.",
  PACKER: "Only orders to pack: shipping name, address and phone, labels and packing slips.",
  ACCOUNTANT: "Read-only: orders, customers, stock, all reports and exports.",
};

export default function StaffPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Staff />
    </Suspense>
  );
}

async function Staff() {
  const me = await requireStaff("staff.manage");
  const rows = await getDb().select().from(staffUsers).orderBy(asc(staffUsers.name));
  return (
    <>
      <PageHeader title="Staff" description="Everyone signs in with a password and an authenticator app. Permissions are enforced on the server for every page and action." />
      <Panel title="Add a staff member" className="mb-6">
        <NewStaffForm />
      </Panel>
      <DataTable head={["Person", "Role", "2-step", "Last sign-in", "Manage"]}>
        {rows.map((s) => (
          <tr key={s.id} className={s.isActive ? "" : "opacity-60"}>
            <Td>
              <span className="font-semibold">{s.name}</span>
              <span className="block text-xs text-muted">{s.email}</span>
              {!s.isActive && <Badge tone="bad">deactivated</Badge>}
            </Td>
            <Td>{ROLE_LABELS[s.role]}</Td>
            <Td>{s.totpEnabled ? <Badge tone="good">on</Badge> : <Badge tone="warn">set up at next sign-in</Badge>}</Td>
            <Td className="whitespace-nowrap text-muted">{s.lastLoginAt ? s.lastLoginAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "Never"}</Td>
            <Td>
              <StaffRowActions staffId={s.id} role={s.role} isActive={s.isActive} isSelf={s.id === me.id} />
            </Td>
          </tr>
        ))}
      </DataTable>
      <Panel title="What each role can do" className="mt-6">
        <dl className="space-y-2 text-sm">
          {Object.keys(ROLE_PERMISSIONS).map((r) => (
            <div key={r}>
              <dt className="font-semibold">{ROLE_LABELS[r as keyof typeof ROLE_LABELS]}</dt>
              <dd className="text-muted">{ROLE_SUMMARY[r]}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </>
  );
}
