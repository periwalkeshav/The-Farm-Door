/**
 * The <html> shell shared by the shop (English and Hindi) and the admin
 * panel, which have separate root layouts: fonts, global styles, the saved
 * "Pause animations" choice and browser error reporting.
 */
import type { Viewport } from "next";
import { Fraunces, Manrope, Noto_Sans_Devanagari, Noto_Serif_Devanagari } from "next/font/google";
import type { ReactNode } from "react";
import { ErrorReporter } from "@/components/error-reporter";
import { MOTION_INIT_SCRIPT } from "@/lib/motion";
import "@/app/globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["opsz"], display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
// Hindi letters. Not preloaded: browsers fetch them only for pages with Devanagari text.
const devaSans = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-deva-sans", display: "swap", preload: false });
const devaSerif = Noto_Serif_Devanagari({ subsets: ["devanagari"], variable: "--font-deva-serif", display: "swap", preload: false });

export const viewport: Viewport = { themeColor: "#1F3B2D" };

/** `nonce` is set on admin pages, whose security policy only lets scripts with that nonce run. */
export function RootHtml({ lang, nonce, children }: { lang: string; nonce?: string; children: ReactNode }) {
  return (
    <html lang={lang} className={`${fraunces.variable} ${manrope.variable} ${devaSans.variable} ${devaSerif.variable}`} suppressHydrationWarning>
      {/* A plain <head> is right in an App Router root layout; the rule only knows this file isn't in app/. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        {/* Applies a saved "Pause animations" choice before anything moves. */}
        {/* Browsers hide nonce values from the page, so React would see a difference while hydrating. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: MOTION_INIT_SCRIPT }} suppressHydrationWarning />
      </head>
      <body className="min-h-dvh">
        {children}
        <ErrorReporter />
      </body>
    </html>
  );
}
