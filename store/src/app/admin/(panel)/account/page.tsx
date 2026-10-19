import { Suspense } from "react";
import { ChangePasswordForm } from "@/components/admin/staff-forms";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { ROLE_LABELS } from "@/server/permissions";

export const metadata = { title: "My account" };

export default function MyAccountPage() {
  return (
    <Suspense fallback={null}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  const me = await requireStaff();
  return (
    <>
      <PageHeader title="My account" description={`${me.name} · ${me.email} · ${ROLE_LABELS[me.role]}`} />
      <Panel title="Change password">
        <ChangePasswordForm />
      </Panel>
      <p className="mt-4 text-sm text-muted">Lost your authenticator phone? Ask the owner to reset your 2-step verification from the Staff page.</p>
    </>
  );
}
