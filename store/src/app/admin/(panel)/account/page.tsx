import Link from "next/link";
import { Suspense } from "react";
import { ChangePasswordForm } from "@/components/admin/staff-forms";
import { PageHeader, Panel } from "@/components/admin/ui";
import { Notice } from "@/components/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { recoveryCodesLeft } from "@/server/auth/recovery-codes";
import { ROLE_LABELS } from "@/server/permissions";

export const metadata = { title: "My account" };

export default function MyAccountPage({ searchParams }: PageProps<"/admin/account">) {
  return (
    <Suspense fallback={null}>
      <Account searchParams={searchParams} />
    </Suspense>
  );
}

async function Account({ searchParams }: { searchParams: PageProps<"/admin/account">["searchParams"] }) {
  const me = await requireStaff();
  const [left, sp] = await Promise.all([recoveryCodesLeft(getDb(), me.id), searchParams]);
  return (
    <>
      <PageHeader title="My account" description={`${me.name} · ${me.email} · ${ROLE_LABELS[me.role]}`} />
      {sp.backup === "used" && (
        <Notice tone="warn" className="mb-6">
          You signed in with a backup code. {left} left. If you&apos;ve lost your phone, ask the owner to reset your 2-step verification (or run the reset command, see DEPLOYMENT.md), then make new backup codes.
        </Notice>
      )}
      <Panel title="Change password" className="mb-6">
        <ChangePasswordForm />
      </Panel>
      <Panel title="Backup codes">
        <p className="text-sm">{left > 0 ? `${left} unused backup code${left === 1 ? "" : "s"}. Each signs you in once if your authenticator phone is lost.` : "No backup codes yet. Without them, a lost phone locks you out until the owner resets your 2-step verification."}</p>
        <Link href="/admin/account/backup-codes" className="mt-3 inline-block rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest">
          {left > 0 ? "Make new backup codes" : "Get backup codes"}
        </Link>
      </Panel>
      <p className="mt-4 text-sm text-muted">Lost your phone and your backup codes? Ask the owner to reset your 2-step verification from the Staff page. The only owner can reset it from the server (see DEPLOYMENT.md).</p>
    </>
  );
}
