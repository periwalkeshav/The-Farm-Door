"use client";

/**
 * Home-page banner that moves to the next slide every few seconds.
 *
 * Follows the WAI-ARIA carousel pattern: previous/next buttons and one dot per
 * slide. It holds still while the pointer is over it or keyboard focus is
 * inside it, then carries on from where it stopped (the timer isn't
 * restarted). It never moves on its own for visitors who ask for reduced
 * motion or pressed "Pause animations" in the top banner, which is how it is
 * stopped (WCAG 2.2.2). Hidden slides are inert (not focusable, not read out).
 * Swipe left/right on phones.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { useMotionPaused } from "./motion";

export type Slide = { id: string; label: string; tone: "light" | "dark"; content: ReactNode };

const INTERVAL_MS = 7000;

export function HeroCarousel({ slides, label = "Highlights" }: { slides: Slide[]; label?: string }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const motionPaused = useMotionPaused();
  const touchX = useRef<number | null>(null);
  const count = slides.length;
  const autoplay = count > 1 && !motionPaused;
  const moving = autoplay && !hovered && !focused;
  // Time left on the current slide, so a pause (hover or focus) resumes rather than starting over.
  const remaining = useRef(INTERVAL_MS);
  const shownIndex = useRef(index);

  useEffect(() => {
    if (shownIndex.current !== index) {
      shownIndex.current = index;
      remaining.current = INTERVAL_MS;
    }
    if (!moving) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [moving, index, count]);

  if (count === 0) return null;
  const go = (i: number) => setIndex((i + count) % count);
  const dark = slides[index].tone === "dark";
  const control = cn(
    "grid size-10 place-items-center rounded-full border backdrop-blur transition",
    dark ? "border-ivory/30 bg-forest-deep/40 text-ivory hover:bg-forest-deep/70" : "border-line bg-paper/80 text-forest hover:border-forest",
  );

  return (
    <section
      aria-roledescription={t("carousel")}
      aria-label={t(label)}
      className="relative overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      {/* Slides share one grid cell, so the banner is as tall as the tallest slide and never jumps. */}
      <div className="grid" aria-live={autoplay ? "off" : "polite"}>
        {slides.map((s, i) => (
          <div
            key={s.id}
            role="group"
            aria-roledescription={t("slide")}
            aria-label={t("{n} of {count}: {label}", { n: i + 1, count, label: s.label })}
            inert={i !== index}
            className={cn(
              "[grid-area:1/1] transition-[opacity,transform,visibility] duration-700 ease-out motion-reduce:transition-none",
              i === index ? "visible translate-x-0 opacity-100" : cn("invisible opacity-0", i < index ? "-translate-x-6" : "translate-x-6"),
            )}
          >
            {s.content}
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 sm:bottom-6">
          <div className="pointer-events-auto mx-auto flex w-max items-center gap-2 rounded-full px-2 py-1">
            <button type="button" className={control} onClick={() => go(index - 1)} aria-label={t("Previous slide")}>
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="flex items-center">
              {slides.map((s, i) => (
                // The button is a 24 px tap target; the dot inside is the visible part.
                <button key={s.id} type="button" onClick={() => go(i)} aria-label={t("Show slide {n}: {label}", { n: i + 1, label: s.label })} aria-current={i === index ? "true" : undefined} className="grid h-6 min-w-6 place-items-center px-0.5">
                  <span className={cn("relative block h-2.5 overflow-hidden rounded-full transition-all", i === index ? "w-10" : "w-2.5", dark ? "bg-ivory/35" : "bg-forest/20")}>
                    {i === index && (
                      // Fills up over the slide's time; pauses (rather than restarts) with the slide.
                      <span
                        key={index}
                        className={cn("absolute inset-0 rounded-full", dark ? "bg-saffron" : "bg-forest", autoplay ? "slide-progress" : "")}
                        data-paused={!moving}
                        style={{ "--slide-duration": `${INTERVAL_MS}ms` } as React.CSSProperties}
                      />
                    )}
                  </span>
                </button>
              ))}
            </div>
            <button type="button" className={control} onClick={() => go(index + 1)} aria-label={t("Next slide")}>
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="m6 3 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
