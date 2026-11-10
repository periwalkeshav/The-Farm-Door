"use client";

/** Share a product: the phone's share sheet where there is one, otherwise WhatsApp or copy the link. */
import { useState } from "react";
import { useI18n } from "@/i18n/client";

export function ShareButton({ title, path, className }: { title: string; path: string; className?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = () => `${window.location.origin}${path}`;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: t("{title} from The Farm Door", { title }), url: url() });
      } catch {
        // Cancelled.
      }
      return;
    }
    setOpen((o) => !o);
  }

  return (
    <div className="relative">
      <button type="button" onClick={share} aria-label={t("Share {title}", { title })} aria-expanded={open} className={className}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5.5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="18.5" r="2.5" />
          <path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full right-0 z-20 mt-2 w-48 rounded-2xl border border-line bg-paper p-2 text-sm shadow-[0_18px_40px_-20px_rgba(31,59,45,.5)]">
          <a href={`https://wa.me/?text=${encodeURIComponent(`${t("{title} from The Farm Door", { title })} ${url()}`)}`} target="_blank" rel="noopener noreferrer" className="block rounded-lg px-3 py-2 font-semibold text-forest hover:bg-sand">
            {t("Share on WhatsApp")}
          </a>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url());
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                // Clipboard blocked.
              }
            }}
            className="block w-full rounded-lg px-3 py-2 text-left font-semibold text-forest hover:bg-sand"
          >
            {t(copied ? "Link copied" : "Copy link")}
          </button>
        </div>
      )}
    </div>
  );
}
