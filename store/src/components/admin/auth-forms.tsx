"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { confirmTotpSetupAction, createBackupCodesAction, staffLoginAction, verifyBackupCodeAction, verifyTotpAction, type AdminAuthState, type BackupCodesState } from "@/actions/admin/auth";
import { CopyButton } from "@/components/copy-button";
import { Field, FieldError, useForm } from "@/components/form";
import { Notice } from "@/components/ui";
import { backupCodeSchema, staffLoginSchema, totpSchema } from "@/lib/form-schemas";

export function StaffLoginForm() {
  const [state, action, pending] = useActionState<AdminAuthState, FormData>(staffLoginAction, null);
  const f = useForm({ schema: staffLoginSchema, action });
  return (
    <form {...f.formProps} className="space-y-4">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Field f={f} name="email" label="Email">
        <input {...f.field("email")} type="email" autoComplete="username" maxLength={200} className="field" />
      </Field>
      <Field f={f} name="password" label="Password">
        <input {...f.field("password")} type="password" autoComplete="current-password" maxLength={200} className="field" />
      </Field>
      <button type="submit" disabled={pending} className="w-full rounded-full bg-forest px-5 py-3 font-bold text-ivory disabled:opacity-60">
        {pending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}

export function TotpForm({ mode }: { mode: "verify" | "setup" }) {
  const [state, action, pending] = useActionState<AdminAuthState, FormData>(mode === "verify" ? verifyTotpAction : confirmTotpSetupAction, null);
  const f = useForm({ schema: totpSchema, action });
  return (
    <form {...f.formProps} className="space-y-4">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <div>
        <label htmlFor={f.id("code")} className="label">
          6-digit code from your authenticator app
        </label>
        <input
          {...f.field("code")}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          onInput={(e) => {
            e.currentTarget.value = e.currentTarget.value.replace(/\D/g, "").slice(0, 6);
          }}
          className="field text-center text-2xl tracking-[.4em]"
        />
        <FieldError f={f} name="code" className="text-center" />
      </div>
      <button type="submit" disabled={pending} className="w-full rounded-full bg-forest px-5 py-3 font-bold text-ivory disabled:opacity-60">
        {pending ? "Checking…" : mode === "verify" ? "Sign in" : "Turn on 2-step verification"}
      </button>
    </form>
  );
}

/** The 2-step sign-in step: authenticator code, or a backup code if the phone isn't available. */
export function VerifyForms() {
  const [backup, setBackup] = useState(false);
  return (
    <div>
      {backup ? <BackupCodeForm /> : <TotpForm mode="verify" />}
      <button type="button" onClick={() => setBackup(!backup)} className="mt-4 w-full text-center text-sm font-semibold text-forest underline">
        {backup ? "Use my authenticator app instead" : "Lost your phone? Use a backup code"}
      </button>
    </div>
  );
}

function BackupCodeForm() {
  const [state, action, pending] = useActionState<AdminAuthState, FormData>(verifyBackupCodeAction, null);
  const f = useForm({ schema: backupCodeSchema, action });
  return (
    <form {...f.formProps} className="space-y-4">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Field f={f} name="code" label="One of your backup codes" hint="Each code works once. We'll email you that it was used.">
        <input {...f.field("code", { hint: true })} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} autoFocus className="field text-center font-mono text-xl tracking-widest uppercase" placeholder="XXXX-XXXX" />
      </Field>
      <button type="submit" disabled={pending} className="w-full rounded-full bg-forest px-5 py-3 font-bold text-ivory disabled:opacity-60">
        {pending ? "Checking…" : "Sign in with backup code"}
      </button>
    </form>
  );
}

/** Makes new backup codes after checking the authenticator code, then shows them once. */
export function BackupCodesMaker({ hasCodes, setup }: { hasCodes: boolean; setup: boolean }) {
  const [state, action, pending] = useActionState<BackupCodesState, FormData>(createBackupCodesAction, null);
  const f = useForm({ schema: totpSchema, action });
  if (state?.codes) {
    const text = `The Farm Door admin backup codes\nEach code works once.\n\n${state.codes.join("\n")}\n`;
    return (
      <div className="space-y-4">
        <Notice tone="warn">Save these now. They won&apos;t be shown again. Keep them somewhere safe away from your phone, like a printed copy or your password manager.</Notice>
        <ol className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-paper p-4 font-mono text-lg sm:grid-cols-5" aria-label="Backup codes" data-testid="backup-codes">
          {state.codes.map((c) => (
            <li key={c} className="text-center select-all">
              {c}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2 print:hidden">
          <CopyButton text={text} label="Copy codes" />
          <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="farm-door-backup-codes.txt" className="rounded-full border border-forest px-3 py-1.5 text-xs font-semibold text-forest">
            Download as a text file
          </a>
          <button type="button" onClick={() => window.print()} className="rounded-full border border-forest px-3 py-1.5 text-xs font-semibold text-forest">
            Print
          </button>
        </div>
        <Link href="/admin" className="inline-block rounded-full bg-forest px-5 py-2.5 font-semibold text-ivory print:hidden">
          {setup ? "I've saved them. Go to the dashboard" : "Done"}
        </Link>
      </div>
    );
  }
  return (
    <form {...f.formProps} className="max-w-sm space-y-4">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      {hasCodes && <Notice tone="warn">Making new codes cancels your old ones.</Notice>}
      <div>
        <label htmlFor={f.id("code")} className="label">
          Current 6-digit code from your authenticator app
        </label>
        <input
          {...f.field("code")}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          onInput={(e) => {
            e.currentTarget.value = e.currentTarget.value.replace(/\D/g, "").slice(0, 6);
          }}
          className="field text-center text-2xl tracking-[.4em]"
        />
        <FieldError f={f} name="code" />
      </div>
      <button type="submit" disabled={pending} className="rounded-full bg-forest px-5 py-2.5 font-semibold text-ivory disabled:opacity-60">
        {pending ? "Checking…" : hasCodes ? "Make new backup codes" : "Show my backup codes"}
      </button>
      {setup && (
        <p className="text-sm">
          <Link href="/admin" className="text-muted underline">
            Skip for now
          </Link>
        </p>
      )}
    </form>
  );
}
