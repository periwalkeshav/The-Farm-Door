"use client";

import { useState, useTransition } from "react";
import { setRefillAction, stopRefillByLinkAction, type RefillState } from "@/actions/orders";
import { Notice } from "@/components/ui";
import { useI18n } from "@/i18n/client";

const OPTIONS = [
  [14, "Every 2 weeks"],
  [30, "Every month"],
  [45, "Every 6 weeks"],
  [60, "Every 2 months"],
  [90, "Every 3 months"],
] as const;

export function RefillReminderControl({ orderNumber, token, current }: { orderNumber: string; token: string; current: number | null }) {
  const { t } = useI18n();
  const [days, setDays] = useState<number>(current ?? 30);
  const [active, setActive] = useState<number | null>(current);
  const [state, setState] = useState<RefillState>(null);
  const [pending, start] = useTransition();
  const run = (value: number) =>
    start(async () => {
      const r = await setRefillAction(orderNumber, token, value);
      setState(r);
      if (r?.ok) setActive(r.intervalDays ?? null);
    });
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">
        {active
          ? t("We'll remind you to reorder these items: {how}.", { how: t(OPTIONS.find(([d]) => d === active)?.[1] ?? "Every {days} days", { days: active }).toLowerCase() })
          : t("Get an email when it's time to restock, with a one-click reorder.")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`refill-${orderNumber}`} className="sr-only">
          {t("How often")}
        </label>
        <select id={`refill-${orderNumber}`} value={days} onChange={(e) => setDays(Number(e.target.value))} className="field w-auto py-2 text-sm">
          {OPTIONS.map(([d, label]) => (
            <option key={d} value={d}>
              {t(label)}
            </option>
          ))}
        </select>
        <button type="button" disabled={pending} onClick={() => run(days)} className="rounded-full border border-forest px-4 py-2 font-semibold text-forest disabled:opacity-60">
          {active ? t("Update") : t("Remind me")}
        </button>
        {active && (
          <button type="button" disabled={pending} onClick={() => run(0)} className="font-semibold text-muted underline">
            {t("Stop")}
          </button>
        )}
      </div>
      {state && <Notice tone={state.ok ? "success" : "error"}>{t(state.message)}</Notice>}
    </div>
  );
}

export function StopRefillButton({ id, token }: { id: number; token: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<RefillState>(null);
  const [pending, start] = useTransition();
  if (state?.ok) return <Notice tone="success">{t(state.message)}</Notice>;
  return (
    <div className="space-y-3">
      <button type="button" disabled={pending} onClick={() => start(async () => setState(await stopRefillByLinkAction(id, token)))} className="rounded-full bg-forest px-6 py-3 font-bold text-ivory disabled:opacity-60">
        {pending ? t("Stopping…") : t("Stop reorder reminders")}
      </button>
      {state && !state.ok && <Notice tone="error">{t(state.message)}</Notice>}
    </div>
  );
}
