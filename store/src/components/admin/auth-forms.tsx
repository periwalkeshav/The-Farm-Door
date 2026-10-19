"use client";

import { useActionState } from "react";
import { confirmTotpSetupAction, staffLoginAction, verifyTotpAction, type AdminAuthState } from "@/actions/admin/auth";
import { Notice } from "@/components/ui";

export function StaffLoginForm() {
  const [state, action, pending] = useActionState<AdminAuthState, FormData>(staffLoginAction, null);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <div>
        <label htmlFor="a-email" className="label">
          Email
        </label>
        <input id="a-email" name="email" type="email" autoComplete="username" required className="field" />
      </div>
      <div>
        <label htmlFor="a-password" className="label">
          Password
        </label>
        <input id="a-password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      <button type="submit" disabled={pending} className="w-full rounded-full bg-forest px-5 py-3 font-bold text-ivory disabled:opacity-60">
        {pending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}

export function TotpForm({ mode }: { mode: "verify" | "setup" }) {
  const [state, action, pending] = useActionState<AdminAuthState, FormData>(mode === "verify" ? verifyTotpAction : confirmTotpSetupAction, null);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <div>
        <label htmlFor="totp" className="label">
          6-digit code from your authenticator app
        </label>
        <input id="totp" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus className="field text-center text-2xl tracking-[.4em]" />
      </div>
      <button type="submit" disabled={pending} className="w-full rounded-full bg-forest px-5 py-3 font-bold text-ivory disabled:opacity-60">
        {pending ? "Checking…" : mode === "verify" ? "Sign in" : "Turn on 2-step verification"}
      </button>
    </form>
  );
}
