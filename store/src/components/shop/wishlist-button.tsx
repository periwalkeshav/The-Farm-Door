"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toggleWishlistAction } from "@/actions/wishlist";
import { cn } from "@/components/ui";
import { useI18n } from "@/i18n/client";

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.3 1.1 5 3 1.7-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const base = "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition";

/** "Save for later". `icon` is the round heart shown on the product photo. */
export function WishlistButton({ productId, slug, signedIn, initialSaved, icon = false }: { productId: number; slug: string; signedIn: boolean; initialSaved: boolean; icon?: boolean }) {
  const { t, href } = useI18n();
  const [saved, setSaved] = useOptimistic(initialSaved);
  const [pending, start] = useTransition();
  const style = icon ? iconStyle : base;
  if (!signedIn) {
    return (
      <Link href={`${href("/login")}?next=${encodeURIComponent(href(`/products/${slug}`))}`} aria-label={icon ? t("Save for later (sign in)") : undefined} className={cn(style, "border-line text-forest hover:border-forest")}>
        <Heart filled={false} /> {!icon && t("Save for later")}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={icon ? t("Save for later") : undefined}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setSaved(!saved);
          await toggleWishlistAction(productId);
        })
      }
      className={cn(style, saved ? "border-chilli/40 text-chilli" : "border-line text-forest hover:border-forest")}
    >
      <Heart filled={saved} /> {!icon && t(saved ? "Saved" : "Save for later")}
    </button>
  );
}

const iconStyle = "grid size-11 place-items-center rounded-full border bg-paper/90 shadow-sm backdrop-blur transition";

export function RemoveSavedButton({ productId }: { productId: number }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => void (await toggleWishlistAction(productId)))} className="text-sm font-semibold text-muted underline hover:text-chilli disabled:opacity-60">
      {t("Remove")}
    </button>
  );
}
