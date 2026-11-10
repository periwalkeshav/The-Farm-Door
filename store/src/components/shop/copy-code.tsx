"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/client";

/** A coupon code you can tap to copy (shown in the scrolling banner). */
export function CopyCode({ code }: { code: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked: the code is on screen to type.
        }
      }}
      aria-label={t(copied ? "Code {code} copied" : "Copy code {code}", { code })}
      className="inline-flex min-h-6 items-center gap-1.5 rounded-full border border-dashed border-saffron px-2.5 py-0.5 font-mono font-bold tracking-wider text-saffron hover:bg-ivory/10"
    >
      {code}
      <span className="font-sans text-[10px] font-semibold tracking-normal text-ivory/80 uppercase">{t(copied ? "Copied" : "Copy")}</span>
    </button>
  );
}
