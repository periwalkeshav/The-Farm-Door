"use client";

import { useActionState, useState, useTransition } from "react";
import { changeMyPasswordAction, changeRoleAction, createStaffAction, resetPasswordAction, resetTwoFactorAction, setActiveAction, type StaffResult } from "@/actions/admin/staff";
import { Field, useForm } from "@/components/form";
import { Notice } from "@/components/ui";
import { changePasswordSchema, createStaffSchema } from "@/lib/form-schemas";

const ROLES = [
  ["OWNER", "Owner"],
  ["MANAGER", "Manager"],
  ["PACKER", "Packing staff"],
  ["ACCOUNTANT", "Accountant (read-only)"],
] as const;

function ResultBox({ r }: { r: StaffResult }) {
  if (!r || (!r.ok && r.fieldErrors)) return null;
  return (
    <Notice tone={r.ok ? "success" : "error"} className="mt-2">
      {r.message}
      {r.secret && <code className="mt-2 block rounded bg-white px-3 py-2 font-mono text-base select-all">{r.secret}</code>}
    </Notice>
  );
}

export function NewStaffForm() {
  const [state, action, pending] = useActionState<StaffResult, FormData>(createStaffAction, null);
  const f = useForm({ schema: createStaffSchema, action, state, resetOnSuccess: true });
  return (
    <div>
      <form {...f.formProps} className="grid gap-3 sm:grid-cols-[1fr_1.3fr_1fr_auto] sm:items-start">
        <Field f={f} name="name" label="Name">
          <input {...f.field("name")} maxLength={80} autoComplete="off" className="field py-2" />
        </Field>
        <Field f={f} name="email" label="Email">
          <input {...f.field("email")} type="email" maxLength={200} autoComplete="off" className="field py-2" />
        </Field>
        <Field f={f} name="role" label="Role">
          <select {...f.field("role")} defaultValue="PACKER" className="field py-2">
            {ROLES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" disabled={pending} className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory disabled:opacity-60 sm:mt-7">
          {pending ? "Adding…" : "Add staff"}
        </button>
      </form>
      <ResultBox r={state} />
    </div>
  );
}

export function StaffRowActions({ staffId, role, isActive, isSelf }: { staffId: number; role: string; isActive: boolean; isSelf: boolean }) {
  const [result, setResult] = useState<StaffResult>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<StaffResult>, question?: string) => {
    if (question && !window.confirm(question)) return false;
    start(async () => setResult(await fn()));
    return true;
  };
  if (isSelf) return <span className="text-xs text-muted">This is you</span>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Role"
          defaultValue={role}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            const label = ROLES.find(([v]) => v === next)?.[1] ?? next;
            if (!run(() => changeRoleAction(staffId, next), `Change their role to ${label}? They'll be signed out and need to sign in again.`)) e.target.value = role;
          }}
          className="field w-auto py-1.5 text-sm"
        >
          {ROLES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button type="button" disabled={pending} onClick={() => run(() => resetPasswordAction(staffId), "Reset their password? Their current password stops working, and you'll get a temporary one to share with them.")} className="text-xs font-semibold text-forest underline">
          Reset password
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => resetTwoFactorAction(staffId), "Reset their 2-step verification? They'll have to set up their authenticator app again at next sign-in.")} className="text-xs font-semibold text-forest underline">
          Reset 2-step
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => setActiveAction(staffId, !isActive), isActive ? "Deactivate this account? They'll be signed out and can't sign in until re-activated." : undefined)} className={`text-xs font-semibold underline ${isActive ? "text-chilli" : "text-forest"}`}>
          {isActive ? "Deactivate" : "Re-activate"}
        </button>
      </div>
      <ResultBox r={result} />
    </div>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<StaffResult, FormData>(changeMyPasswordAction, null);
  const f = useForm({ schema: changePasswordSchema, action, state, resetOnSuccess: true });
  return (
    <form {...f.formProps} className="grid max-w-xl gap-3">
      <Field f={f} name="current" label="Current password">
        <input {...f.field("current")} type="password" autoComplete="current-password" maxLength={200} className="field" />
      </Field>
      <Field f={f} name="next" label="New password" hint="At least 12 characters, mixing three of: lower-case, upper-case, numbers, symbols.">
        <input {...f.field("next", { hint: true })} type="password" autoComplete="new-password" maxLength={200} className="field" />
      </Field>
      <Field f={f} name="confirm" label="Confirm new password">
        <input {...f.field("confirm")} type="password" autoComplete="new-password" maxLength={200} className="field" />
      </Field>
      <button type="submit" disabled={pending} className="justify-self-start rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory disabled:opacity-60">
        {pending ? "Changing…" : "Change password"}
      </button>
      <ResultBox r={state} />
    </form>
  );
}
