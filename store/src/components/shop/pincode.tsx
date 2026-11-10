"use client";

/**
 * The visitor's delivery pincode, remembered in this browser once they enter
 * it (in the header's "Deliver to", on a product page or at checkout), so
 * product pages show the delivery date straight away and checkout starts with it.
 */
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { lookupPincodeAction } from "@/actions/checkout";
import { setCartPincodeAction } from "@/actions/cart";
import { cn } from "@/components/ui";
import { isValidPincode } from "@/lib/india";

const KEY = "tfd-pincode";
const EVENT = "tfd-pincode-change";

export type SavedPincode = { pincode: string; city: string };

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The remembered pincode, or null (always null during server rendering). */
export function useSavedPincode(): SavedPincode | null {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  return useMemo(() => {
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as SavedPincode;
      return isValidPincode(v.pincode) ? v : null;
    } catch {
      return null;
    }
  }, [raw]);
}

/** Remembers a pincode (and its town, when known) in this browser, so "Deliver to" shows it. */
export function rememberPincode(pincode: string, city = "") {
  if (!isValidPincode(pincode)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ pincode, city }));
  } catch {
    // Storage blocked: it's remembered for this page only.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Remembers a pincode and puts it on the cart for shipping estimates. */
export function savePincode(pincode: string, city = "") {
  if (!isValidPincode(pincode)) return;
  rememberPincode(pincode, city);
  void setCartPincodeAction(pincode);
}

const pin = (
  <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
  </svg>
);

/** "Deliver to Jaipur 302001": opens a small box to enter or change the pincode. */
export function DeliverTo({ className, labels }: { className?: string; labels: { deliverTo: string; enterPincode: string; title: string; hint: string; save: string; invalid: string; saved: string } }) {
  const saved = useSavedPincode();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPincode(value)) {
      setError(labels.invalid);
      return;
    }
    setBusy(true);
    const details = await lookupPincodeAction(value).catch(() => null);
    savePincode(value, details?.city ?? "");
    setBusy(false);
    setOpen(false);
  }

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          setValue(saved?.pincode ?? "");
          setError(null);
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-controls={`${id}-box`}
        className="flex items-center gap-1.5 rounded-full text-left text-sm text-forest hover:text-forest-deep"
      >
        {pin}
        <span className="leading-tight">
          <span className="block text-[11px] text-muted">{labels.deliverTo}</span>
          <span className="block font-semibold">{saved ? `${saved.city ? `${saved.city} ` : ""}${saved.pincode}` : labels.enterPincode}</span>
        </span>
      </button>
      {open && (
        <div id={`${id}-box`} className="absolute top-full left-0 z-50 mt-2 w-72 rounded-2xl border border-line bg-paper p-4 shadow-[0_18px_40px_-20px_rgba(31,59,45,.5)]">
          <form onSubmit={save}>
            <label htmlFor={`${id}-input`} className="label">
              {labels.title}
            </label>
            <div className="flex gap-2">
              <input
                id={`${id}-input`}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={6}
                placeholder="302001"
                autoFocus
                aria-invalid={error ? true : undefined}
                aria-describedby={`${id}-hint`}
                className="field flex-1"
              />
              <button type="submit" disabled={busy} className="rounded-xl bg-forest px-4 font-semibold text-ivory disabled:opacity-60">
                {labels.save}
              </button>
            </div>
            <p id={`${id}-hint`} className={cn("mt-2 text-xs", error ? "font-semibold text-chilli" : "text-muted")} role={error ? "alert" : undefined}>
              {error ?? labels.hint}
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
