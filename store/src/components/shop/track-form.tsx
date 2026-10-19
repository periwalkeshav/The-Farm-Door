"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { trackOrderAction, type TrackState } from "@/actions/orders";
import { Notice } from "@/components/ui";

export function TrackForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState<TrackState, FormData>(trackOrderAction, null);
  useEffect(() => {
    if (state?.ok) router.replace(`/track?order=${state.orderNumber}&k=${state.token}`);
  }, [state, router]);
  return (
    <form action={action} className="card grid gap-4 p-5 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
      <div>
        <label htmlFor="orderNumber" className="label">
          Order number
        </label>
        <input id="orderNumber" name="orderNumber" inputMode="numeric" required className="field" placeholder="e.g. 100001" />
      </div>
      <div>
        <label htmlFor="contact" className="label">
          Email or mobile number
        </label>
        <input id="contact" name="contact" required className="field" autoComplete="email" />
      </div>
      <button type="submit" disabled={pending} className="rounded-full bg-forest px-6 py-2.5 font-bold text-ivory disabled:opacity-60">
        {pending ? "Finding…" : "Track"}
      </button>
      {state && !state.ok && (
        <Notice tone="error" className="sm:col-span-3">
          {state.message}
        </Notice>
      )}
    </form>
  );
}
