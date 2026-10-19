"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/actions/auth";
import { Notice } from "@/components/ui";

export function LoginForm({ next, googleEnabled }: { next: string; googleEnabled: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, null);
  const stage = state?.stage ?? "email";
  return (
    <div className="card p-6 sm:p-8">
      {state?.message && (
        <Notice tone={state.error ? "error" : "success"} className="mb-5">
          {state.message}
        </Notice>
      )}
      {stage === "email" ? (
        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="login-email" className="label">
              Email address
            </label>
            <input id="login-email" name="email" type="email" autoComplete="email" required defaultValue={state?.email} className="field" />
          </div>
          <button type="submit" disabled={pending} className="w-full rounded-full bg-forest px-5 py-3 font-bold text-ivory disabled:opacity-60">
            {pending ? "Sending code…" : "Email me a sign-in code"}
          </button>
          <p className="text-center text-xs text-muted">No password needed. New here? Your account is created when you sign in.</p>
        </form>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="email" value={state?.email} />
          <input type="hidden" name="intent" value="verify" />
          <div>
            <label htmlFor="login-code" className="label">
              6-digit code
            </label>
            <input
              id="login-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              className="field text-center text-2xl tracking-[.5em]"
            />
          </div>
          <button type="submit" disabled={pending} className="w-full rounded-full bg-forest px-5 py-3 font-bold text-ivory disabled:opacity-60">
            {pending ? "Checking…" : "Sign in"}
          </button>
          <p className="text-center text-sm text-muted">
            Wrong email or no code?{" "}
            <a href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-forest underline">
              Start again
            </a>
          </p>
        </form>
      )}
      {googleEnabled && stage === "email" && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          <a href={`/api/auth/google/start?next=${encodeURIComponent(next)}`} className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-paper px-5 py-3 font-semibold text-ink hover:border-forest">
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
              <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9z" />
              <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
            </svg>
            Continue with Google
          </a>
        </>
      )}
    </div>
  );
}
