import { desc, isNotNull, isNull } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { ResolveErrorButton } from "@/components/admin/error-actions";
import { Badge, PageHeader } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { errorEvents } from "@/db/schema";

export const metadata = { title: "Site errors" };

const when = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function ErrorsPage({ searchParams }: PageProps<"/admin/errors">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Errors searchParams={searchParams} />
    </Suspense>
  );
}

async function Errors({ searchParams }: { searchParams: PageProps<"/admin/errors">["searchParams"] }) {
  await requireStaff("settings.manage");
  const showFixed = (await searchParams).show === "fixed";
  const rows = await getDb()
    .select()
    .from(errorEvents)
    .where(showFixed ? isNotNull(errorEvents.resolvedAt) : isNull(errorEvents.resolvedAt))
    .orderBy(desc(errorEvents.lastSeenAt))
    .limit(200);
  return (
    <>
      <PageHeader
        title="Site errors"
        description="Problems the website ran into, grouped so repeats count once. The owner alert email gets at most one message an hour per error. Share these details with whoever maintains the site; they don't contain customers' personal data."
      />
      <div className="mb-4 flex gap-2">
        <Link href="/admin/errors" className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${!showFixed ? "border-forest bg-forest text-ivory" : "border-line bg-paper text-forest"}`}>
          Open
        </Link>
        <Link href="/admin/errors?show=fixed" className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${showFixed ? "border-forest bg-forest text-ivory" : "border-line bg-paper text-forest"}`}>
          Marked fixed
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-line bg-paper p-6 text-sm text-muted">{showFixed ? "Nothing marked fixed yet." : "No open errors. 🎉"}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((e) => (
            <li key={e.id} className="rounded-2xl border border-line bg-paper p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold break-words text-forest">{e.message}</p>
                  <p className="mt-1 text-xs text-muted">
                    <Badge tone={e.source === "server" ? "bad" : "warn"}>{e.source === "server" ? "Server" : "Browser"}</Badge> {e.path || "—"} {e.route && <span className="font-mono">· {e.route}</span>}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Seen {e.count} time{e.count === 1 ? "" : "s"} · first {when(e.firstSeenAt)} · last {when(e.lastSeenAt)}
                    {e.digest && <> · reference {e.digest}</>}
                  </p>
                </div>
                {!showFixed && <ResolveErrorButton id={e.id} />}
              </div>
              {e.stack && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-forest">Technical details</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-ivory p-3 text-[11px] leading-relaxed">{e.stack}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
