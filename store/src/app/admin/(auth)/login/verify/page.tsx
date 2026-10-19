import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TotpForm } from "@/components/admin/auth-forms";
import { getStaffSession } from "@/data/session";

export const metadata = { title: "2-step verification" };

export default function VerifyPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl">2-step verification</h1>
      <p className="mb-5 text-sm text-muted">Open your authenticator app and enter the current code for The Farm Door Admin.</p>
      <Suspense fallback={null}>
        <Guard />
      </Suspense>
    </>
  );
}

async function Guard() {
  const s = await getStaffSession();
  if (!s) redirect("/admin/login");
  if (!s.mfaPending) redirect("/admin");
  if (!s.totpEnabled) redirect("/admin/setup-2fa");
  return <TotpForm mode="verify" />;
}
