import type { ReactNode } from "react";
import { Container } from "@/components/ui";
import { getI18n } from "@/i18n/server";

/** A visible placeholder for a business detail or decision the owner still has to confirm. */
export function ToConfirm({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-saffron/25 px-1 text-ink">[to confirm: {children}]</mark>;
}

/**
 * A text page. `englishOnly` pages (the legal policies) keep their English text on Hindi pages too,
 * with a note saying so: legal wording shouldn't be translated without a lawyer checking it.
 */
export async function ContentPage({ title, updated, children, draft = true, englishOnly = false }: { title: string; updated?: string; children: ReactNode; draft?: boolean; englishOnly?: boolean }) {
  const { lang, t } = await getI18n();
  const english = englishOnly && lang === "hi";
  return (
    <Container className="max-w-3xl py-12">
      <h1 className="text-4xl sm:text-5xl">{englishOnly ? title : t(title)}</h1>
      {updated && <p className="mt-2 text-sm text-muted">{t("Last updated: {date}", { date: updated })}</p>}
      {english && <p className="mt-4 rounded-xl border border-line bg-paper px-4 py-3 text-sm">यह पेज अभी केवल अंग्रेज़ी में उपलब्ध है। कोई सवाल हो तो हमसे संपर्क करें, हम हिंदी में मदद करेंगे।</p>}
      {draft && (
        <p className="mt-4 rounded-xl border border-saffron/40 bg-[#fdf3e1] px-4 py-3 text-sm text-[#6b4510]">
          {t("Draft text prepared for The Farm Door. Highlighted items must be confirmed, and the whole page should be reviewed by a lawyer before launch.")}
        </p>
      )}
      <div className="prose-shop mt-8" lang={english ? "en-IN" : undefined}>
        {children}
      </div>
    </Container>
  );
}

export function businessLine(store: { legalName: string; tradeName: string; addressLine1: string; addressLine2: string; city: string; state: string; pincode: string }) {
  const address = [store.addressLine1, store.addressLine2, store.city, store.state, store.pincode].filter(Boolean).join(", ");
  return { name: store.legalName || store.tradeName, address };
}
