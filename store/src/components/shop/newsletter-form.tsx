"use client";

import { useActionState } from "react";
import { subscribeAction, type SubscribeState } from "@/actions/newsletter";
import { useForm } from "@/components/form";
import { cn } from "@/components/ui";
import { newsletterSchema } from "@/lib/form-schemas";
import { useI18n } from "@/i18n/client";

export function NewsletterForm({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<SubscribeState, FormData>(subscribeAction, null);
  const f = useForm({ schema: newsletterSchema, action });
  const problem = f.error("email") ?? (state && !state.ok ? state.message : null);
  if (state?.ok) return <p className={cn("text-sm font-semibold", tone === "dark" ? "text-saffron" : "text-forest")}>{t(state.message)}</p>;
  return (
    <form {...f.formProps} className="max-w-sm">
      {/* The input itself has no outline, so the pill shows where the keyboard is. */}
      <div
        className={cn(
          "flex gap-1.5 rounded-full border p-1.5 transition focus-within:ring-4",
          tone === "dark" ? "border-ivory/20 bg-ivory/5 focus-within:border-saffron focus-within:ring-saffron/30" : "border-line bg-paper focus-within:border-forest focus-within:ring-saffron/25",
        )}
      >
        <label htmlFor={f.id("email")} className="sr-only">
          {t("Email address")}
        </label>
        <input
          {...f.field("email")}
          type="email"
          maxLength={200}
          autoComplete="email"
          placeholder={t("Your email")}
          className={cn("min-w-0 flex-1 bg-transparent px-3 text-sm outline-none", tone === "dark" ? "text-ivory placeholder:text-ivory/50" : "text-ink")}
        />
        <button type="submit" disabled={pending} className="rounded-full bg-saffron px-4 py-2 text-sm font-bold text-forest-deep disabled:opacity-60">
          {pending ? "…" : t("Subscribe")}
        </button>
      </div>
      <p className={cn("mt-2 text-xs", tone === "dark" ? "text-ivory/55" : "text-muted")}>{t("Occasional emails about new spices and offers. Unsubscribe any time.")}</p>
      {problem && (
        <p id={`${f.id("email")}-error`} className={cn("mt-1 text-xs font-semibold", tone === "dark" ? "text-[#ffb4a3]" : "text-chilli")}>
          {t(problem)}
        </p>
      )}
    </form>
  );
}
