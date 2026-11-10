"use client";

/**
 * Site-wide "Pause animations" setting (WCAG 2.2.2: moving content must be
 * stoppable). Stored per browser; also on when the device asks for reduced motion.
 * The inline script in the root layout applies a saved choice before the page paints.
 */
import { useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/client";
import { MOTION_KEY as KEY } from "@/lib/motion";

const EVENT = "tfd-motion-change";
const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(REDUCED);
  media.addEventListener("change", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

const userPaused = () => document.documentElement.dataset.motion === "paused";

/** True when animations should not run: paused by the visitor, or reduced motion requested. */
export function useMotionPaused() {
  return useSyncExternalStore(
    subscribe,
    () => userPaused() || window.matchMedia(REDUCED).matches,
    () => false,
  );
}

function setPaused(paused: boolean) {
  if (paused) document.documentElement.dataset.motion = "paused";
  else delete document.documentElement.dataset.motion;
  try {
    if (paused) localStorage.setItem(KEY, "paused");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function MotionToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const paused = useSyncExternalStore(subscribe, userPaused, () => false);
  const reduced = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
  if (reduced) return null; // nothing moves anyway
  return (
    <button
      type="button"
      onClick={() => setPaused(!paused)}
      aria-pressed={paused}
      aria-label={t(paused ? "Play animations" : "Pause animations")}
      title={t(paused ? "Play animations" : "Pause animations")}
      className={className}
    >
      {paused ? (
        <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
          <path d="M4 2.5v11l9-5.5z" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
          <rect x="3.5" y="2.5" width="3" height="11" rx="1" />
          <rect x="9.5" y="2.5" width="3" height="11" rx="1" />
        </svg>
      )}
    </button>
  );
}
