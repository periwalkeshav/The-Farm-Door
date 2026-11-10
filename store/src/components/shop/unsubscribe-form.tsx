"use client";

import { useActionState } from "react";
import { optOutAction, type OptOutState } from "@/actions/newsletter";
import { Notice } from "@/components/ui";
import { useI18n } from "@/i18n/client";

export function UnsubscribeForm({ email, token }: { email: string; token: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<OptOutState, FormData>(optOutAction.bind(null, email, token), null);
  if (state?.ok) return <Notice tone="success">{t(state.message)}</Notice>;
  return (
    <form action={action} className="space-y-3">
      <button type="submit" disabled={pending} className="rounded-full bg-forest px-6 py-3 font-bold text-ivory hover:bg-forest-deep disabled:opacity-60">
        {pending ? t("Saving…") : t("Stop reminders and offers")}
      </button>
      {state && !state.ok && <Notice tone="error">{t(state.message)}</Notice>}
    </form>
  );
}
