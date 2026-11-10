"use client";

import { useTransition } from "react";
import { resolveErrorAction } from "@/actions/admin/errors";

export function ResolveErrorButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => resolveErrorAction(id))} className="rounded-full border border-forest px-3 py-1.5 text-xs font-semibold text-forest disabled:opacity-60">
      {pending ? "Saving…" : "Mark fixed"}
    </button>
  );
}
