import { Suspense } from "react";
import { ImportComingSoonForm } from "@/components/admin/newsletter-forms";
import { PageHeader, Panel } from "@/components/admin/ui";
import { Notice } from "@/components/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { COMING_SOON_SOURCE, subscriberCounts, unsubscribedCount } from "@/server/newsletter";
import { can } from "@/server/permissions";

export const metadata = { title: "Newsletter" };

export default function NewsletterPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Newsletter />
    </Suspense>
  );
}

async function Newsletter() {
  const staff = await requireStaff("customers.view");
  const db = getDb();
  const [counts, unsubscribed] = await Promise.all([subscriberCounts(db), unsubscribedCount(db)]);
  const total = counts.reduce((s, c) => s + c.n, 0);
  const launchOnly = counts.find((c) => c.source === COMING_SOON_SOURCE)?.n ?? 0;
  return (
    <>
      <PageHeader
        title="Newsletter"
        description="People who agreed to hear from you. Send campaigns from an email-marketing tool (most have a free plan): download the list, import it there, and let the tool handle unsubscribes."
        actions={
          can(staff.role, "exports") ? (
            <a href="/admin/export/newsletter" download className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest">
              Download CSV
            </a>
          ) : undefined
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={`Subscribers (${total.toLocaleString("en-IN")})`}>
          {counts.length === 0 ? (
            <p className="text-sm text-muted">No subscribers yet.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {counts.map((c) => (
                <li key={c.source} className="flex justify-between gap-4 py-2">
                  <span>{c.source}</span>
                  <span className="font-semibold tabular-nums">{c.n.toLocaleString("en-IN")}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">{unsubscribed.toLocaleString("en-IN")} unsubscribed (kept so they&apos;re never added back).</p>
          {launchOnly > 0 && (
            <Notice tone="warn" className="mt-4">
              The {launchOnly.toLocaleString("en-IN")} people from the coming-soon page were told they&apos;d only hear about your launch. Send them the launch announcement with an invitation to subscribe for offers, but don&apos;t add them to regular offer emails.
            </Notice>
          )}
        </Panel>
        {can(staff.role, "settings.manage") && (
          <Panel title="Import the coming-soon list">
            <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>In Netlify, open the coming-soon site and go to Forms.</li>
              <li>Open the “notify” form and download the submissions as CSV.</li>
              <li>Upload that file here. Addresses already on the list, or that unsubscribed, are skipped.</li>
            </ol>
            <ImportComingSoonForm />
          </Panel>
        )}
      </div>
    </>
  );
}
