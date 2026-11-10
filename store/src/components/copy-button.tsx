"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked: the code is on screen to copy by hand.
        }
      }}
      className="rounded-full border border-forest px-3 py-1.5 text-xs font-semibold text-forest"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
