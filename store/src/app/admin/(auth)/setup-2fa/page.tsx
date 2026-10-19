import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { Suspense } from "react";
import { startTotpSetupAction } from "@/actions/admin/auth";
import { TotpForm } from "@/components/admin/auth-forms";
import { getStaffSession } from "@/data/session";
import { getDb } from "@/db";
import { getStaff, readTotpSecret } from "@/server/auth/staff";
import { otpauthUrl } from "@/lib/totp";

export const metadata = { title: "Set up 2-step verification" };

export default function SetupPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl">Set up 2-step verification</h1>
      <p className="mb-5 text-sm text-muted">Required for every staff account. Install an authenticator app (Google Authenticator, Microsoft Authenticator or 1Password) on your phone.</p>
      <Suspense fallback={null}>
        <SetupContent />
      </Suspense>
    </>
  );
}

async function SetupContent() {
  const s = await getStaffSession();
  if (!s) redirect("/admin/login");
  if (s.totpEnabled) redirect(s.mfaPending ? "/admin/login/verify" : "/admin");
  const staff = await getStaff(getDb(), s.id);
  const secret = staff ? readTotpSecret(staff) : null;
  if (!secret) {
    return (
      <form action={startTotpSetupAction}>
        <button type="submit" className="w-full rounded-full bg-forest px-5 py-3 font-bold text-ivory">
          Show my setup QR code
        </button>
      </form>
    );
  }
  const qr = await QRCode.toDataURL(otpauthUrl(secret, s.email), { margin: 1, width: 220, color: { dark: "#1F3B2D", light: "#FFFDF8" } });
  return (
    <div className="space-y-5">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>In your authenticator app, add an account and scan this QR code.</li>
        <li>Enter the 6-digit code it shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      <img src={qr} alt="QR code for your authenticator app" width={220} height={220} className="mx-auto rounded-xl border border-line" />
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-forest">Can&apos;t scan? Enter this key instead</summary>
        <p className="mt-2 font-mono text-xs break-all" data-testid="totp-secret">
          {secret.match(/.{1,4}/g)!.join(" ")}
        </p>
      </details>
      <TotpForm mode="setup" />
    </div>
  );
}
