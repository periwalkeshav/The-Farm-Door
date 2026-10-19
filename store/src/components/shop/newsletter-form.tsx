"use client";

import { useActionState } from "react";
import { subscribeAction, type SubscribeState } from "@/actions/newsletter";
import { cn } from "@/components/ui";

export function NewsletterForm({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [state, action, pending] = useActionState<SubscribeState, FormData>(subscribeAction, null);
  if (state?.ok) return <p className={cn("text-sm font-semibold", tone === "dark" ? "text-saffron" : "text-forest")}>{state.message}</p>;
  return (
    <form action={action} className="max-w-sm">
      <div className={cn("flex gap-1.5 rounded-full border p-1.5", tone === "dark" ? "border-ivory/20 bg-ivory/5" : "border-line bg-paper")}>
        <label htmlFor={`nl-${tone}`} className="sr-only">
          Email address
        </label>
        <input
          id={`nl-${tone}`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Your email"
          className={cn("min-w-0 flex-1 bg-transparent px-3 text-sm outline-none", tone === "dark" ? "text-ivory placeholder:text-ivory/50" : "text-ink")}
        />
        <button type="submit" disabled={pending} className="rounded-full bg-saffron px-4 py-2 text-sm font-bold text-forest-deep disabled:opacity-60">
          {pending ? "…" : "Subscribe"}
        </button>
      </div>
      <p className={cn("mt-2 text-xs", tone === "dark" ? "text-ivory/55" : "text-muted")}>Occasional emails about new spices and offers. Unsubscribe any time.</p>
      {state && !state.ok && <p className="mt-1 text-xs font-semibold text-chilli">{state.message}</p>}
    </form>
  );
}
