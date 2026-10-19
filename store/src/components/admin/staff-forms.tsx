"use client";

import { useActionState, useState, useTransition } from "react";
import { changeMyPasswordAction, changeRoleAction, createStaffAction, resetPasswordAction, resetTwoFactorAction, setActiveAction, type StaffResult } from "@/actions/admin/staff";
import { Notice } from "@/components/ui";

const ROLES = [
  ["OWNER", "Owner"],
  ["MANAGER", "Manager"],
  ["PACKER", "Packing staff"],
  ["ACCOUNTANT", "Accountant (read-only)"],
] as const;

function ResultBox({ r }: { r: StaffResult }) {
  if (!r) return null;
  return (
    <Notice tone={r.ok ? "success" : "error"} className="mt-2">
      {r.message}
      {r.secret && <code className="mt-2 block rounded bg-white px-3 py-2 font-mono text-base select-all">{r.secret}</code>}
    </Notice>
  );
}

export function NewStaffForm() {
  const [state, action, pending] = useActionState<StaffResult, FormData>(createStaffAction, null);
  return (
    <div>
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1.3fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="st-name" className="label">
            Name
          </label>
          <input id="st-name" name="name" required className="field py-2" />
        </div>
        <div>
          <label htmlFor="st-email" className="label">
            Email
          </label>
          <input id="st-email" name="email" type="email" required className="field py-2" />
        </div>
        <div>
          <label htmlFor="st-role" className="label">
            Role
          </label>
          <select id="st-role" name="role" defaultValue="PACKER" className="field py-2">
            {ROLES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory disabled:opacity-60">
          Add staff
        </button>
      </form>
      <ResultBox r={state} />
    </div>
  );
}

export function StaffRowActions({ staffId, role, isActive, isSelf }: { staffId: number; role: string; isActive: boolean; isSelf: boolean }) {
  const [result, setResult] = useState<StaffResult>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<StaffResult>) => start(async () => setResult(await fn()));
  if (isSelf) return <span className="text-xs text-muted">This is you</span>;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Role" defaultValue={role} disabled={pending} onChange={(e) => run(() => changeRoleAction(staffId, e.target.value))} className="field w-auto py-1.5 text-sm">
          {ROLES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button type="button" disabled={pending} onClick={() => run(() => resetPasswordAction(staffId))} className="text-xs font-semibold text-forest underline">
          Reset password
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => resetTwoFactorAction(staffId))} className="text-xs font-semibold text-forest underline">
          Reset 2-step
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => setActiveAction(staffId, !isActive))} className={`text-xs font-semibold underline ${isActive ? "text-chilli" : "text-forest"}`}>
          {isActive ? "Deactivate" : "Re-activate"}
        </button>
      </div>
      <ResultBox r={result} />
    </div>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<StaffResult, FormData>(changeMyPasswordAction, null);
  return (
    <form action={action} className="grid max-w-xl gap-3">
      <div>
        <label htmlFor="cp-current" className="label">
          Current password
        </label>
        <input id="cp-current" name="current" type="password" autoComplete="current-password" required className="field" />
      </div>
      <div>
        <label htmlFor="cp-next" className="label">
          New password
        </label>
        <input id="cp-next" name="next" type="password" autoComplete="new-password" required className="field" />
        <p className="mt-1 text-xs text-muted">At least 12 characters, mixing three of: lower-case, upper-case, numbers, symbols.</p>
      </div>
      <div>
        <label htmlFor="cp-confirm" className="label">
          Confirm new password
        </label>
        <input id="cp-confirm" name="confirm" type="password" autoComplete="new-password" required className="field" />
      </div>
      <button type="submit" disabled={pending} className="justify-self-start rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory disabled:opacity-60">
        Change password
      </button>
      <ResultBox r={state} />
    </form>
  );
}
