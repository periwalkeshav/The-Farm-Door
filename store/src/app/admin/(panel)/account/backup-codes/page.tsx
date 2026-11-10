import Link from "next/link";
import { Suspense } from "react";
import { BackupCodesMaker } from "@/components/admin/auth-forms";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { RECOVERY_CODE_COUNT, recoveryCodesLeft } from "@/server/auth/recovery-codes";

export const metadata = { title: "Backup codes" };

export default function BackupCodesPage({ searchParams }: PageProps<"/admin/account/backup-codes">) {
  return (
    <Suspense fallback={null}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/admin/account/backup-codes">["searchParams"] }) {
  const me = await requireStaff();
  const setup = (await searchParams).setup === "1";
  const left = await recoveryCodesLeft(getDb(), me.id);
  return (
    <>
      {!setup && (
        <Link href="/admin/account" className="text-sm text-muted hover:underline">
          ← My account
        </Link>
      )}
      <PageHeader
        title={setup ? "2-step verification is on. Now save your backup codes" : "Backup codes"}
        description={`If your phone is lost, broken or reset, a backup code signs you in instead of the authenticator app. You get ${RECOVERY_CODE_COUNT}; each works once.`}
      />
      <Panel>
        <p className="mb-4 text-sm">{left > 0 ? `You have ${left} unused backup code${left === 1 ? "" : "s"}.` : "You don't have any backup codes yet."}</p>
        <BackupCodesMaker hasCodes={left > 0} setup={setup} />
      </Panel>
    </>
  );
}
