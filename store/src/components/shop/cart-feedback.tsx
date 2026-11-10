"use client";

/**
 * What happens on screen after something is added to the cart, wherever that
 * was (product page, a product card, "add all"): a short "Added" pop-up with a
 * link to the cart, and the floating cart button (phones) updates its count.
 * Also the back-to-top button.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui";
import { stripLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";

const EVENT = "tfd-cart-added";
/** `silent` updates the cart count without the pop-up (the page already says it was added). */
type Added = { message: string; count?: number; silent?: boolean };

/** Call after a successful add to cart. */
export function announceAdded(detail: Added) {
  window.dispatchEvent(new CustomEvent<Added>(EVENT, { detail }));
}

function useAdded(handler: (detail: Added) => void) {
  useEffect(() => {
    const listener = (e: Event) => handler((e as CustomEvent<Added>).detail);
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, [handler]);
}

const HIDDEN_ON = ["/cart", "/checkout"];

export function CartToast() {
  const { t, href } = useI18n();
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const pathname = usePathname();
  useAdded((d) => {
    if (!d.silent) setToast({ message: d.message, id: Date.now() });
  });
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8">
      {toast && (
        <div key={toast.id} className="pointer-events-auto flex items-center gap-4 rounded-full bg-forest-deep px-5 py-3 text-sm font-semibold text-ivory shadow-[0_18px_40px_-16px_rgba(22,48,31,.7)]">
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 20 20" className="size-5 text-saffron" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {toast.message}
          </span>
          {!HIDDEN_ON.includes(stripLocale(pathname)) && (
            <Link href={href("/cart")} className="text-saffron underline">
              {t("View cart")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** Cart button that stays in the corner on phones, with the item count. */
export function FloatingCart({ count: serverCount }: { count: number }) {
  const { t, href } = useI18n();
  const pathname = usePathname();
  const [count, setCount] = useState(serverCount);
  const [lastServer, setLastServer] = useState(serverCount);
  const [bump, setBump] = useState(0);
  if (serverCount !== lastServer) {
    setLastServer(serverCount);
    setCount(serverCount);
  }
  useAdded((d) => {
    if (d.count !== undefined) setCount(d.count);
    setBump((b) => b + 1);
  });
  // Only once there's something in the cart: an empty one has the header's cart icon.
  // Product pages have their own sticky "Add to cart" bar in that corner.
  if (count === 0 || HIDDEN_ON.includes(stripLocale(pathname)) || stripLocale(pathname).startsWith("/products/")) return null;
  return (
    <Link
      key={bump}
      href={href("/cart")}
      aria-label={t(count === 1 ? "Cart, {count} item" : "Cart, {count} items", { count })}
      className={cn("cart-bump fixed right-4 bottom-4 z-40 grid size-14 place-items-center rounded-full border-4 border-ivory bg-forest text-ivory shadow-[0_14px_30px_-10px_rgba(22,48,31,.6)] md:hidden", bump === 0 && "[animation:none]")}
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </svg>
      {count > 0 && <span className="absolute -top-1 -right-1 grid min-w-6 place-items-center rounded-full bg-saffron px-1 text-xs font-bold text-forest-deep">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}

export function BackToTop() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 900);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
      aria-label={t("Back to top")}
      className="fixed right-5 bottom-28 z-40 grid size-11 place-items-center rounded-full border border-line bg-paper text-forest shadow-[0_10px_24px_-12px_rgba(22,48,31,.5)] hover:border-forest md:right-6 md:bottom-6"
    >
      <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
