import Link from "next/link";
import { Suspense } from "react";
import { Badge, DataTable, PageHeader, Td } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { formatINR } from "@/lib/money";
import { listCustomers } from "@/server/customers";
import { can } from "@/server/permissions";

export const metadata = { title: "Customers" };
const PAGE = 50;

const SEGMENT_LABELS = { NEW: "First order", REPEAT: "Repeat", LAPSED: "Lapsed (90+ days)", NO_ORDERS: "No orders" } as const;
const SEGMENT_TONES = { NEW: "info", REPEAT: "good", LAPSED: "warn", NO_ORDERS: "neutral" } as const;

export default function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading customers…</p>}>
      <CustomersList searchParams={searchParams} />
    </Suspense>
  );
}

async function CustomersList({ searchParams }: { searchParams: PageProps<"/admin/customers">["searchParams"] }) {
  const staff = await requireStaff("customers.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const segment = typeof sp.segment === "string" ? sp.segment : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await listCustomers(getDb(), { q, segment, limit: PAGE, offset: (page - 1) * PAGE });
  const total = rows[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (over: Record<string, string>) => `?${new URLSearchParams({ ...(q && { q }), ...(segment && { segment }), ...over })}`;
  const segments = [
    ["", "All"],
    ["repeat", "Repeat"],
    ["new", "First order"],
    ["lapsed", "Lapsed"],
    ["none", "No orders"],
    ["subscribed", "Newsletter"],
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description={`${total} customer${total === 1 ? "" : "s"}. Spend counts confirmed orders that weren't cancelled or returned.`}
        actions={
          can(staff.role, "exports") ? (
            <a href={`/admin/export/customers${qs({})}`} className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest">
              Export CSV
            </a>
          ) : null
        }
      />
      <form className="mb-4 flex flex-wrap items-end gap-3">
        {segment && <input type="hidden" name="segment" value={segment} />}
        <div>
          <label htmlFor="c-q" className="label">
            Search
          </label>
          <input id="c-q" name="q" defaultValue={q} placeholder="Name, email or phone" className="field w-72 py-2" />
        </div>
        <button type="submit" className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory">
          Search
        </button>
      </form>
      <div className="mb-4 flex flex-wrap gap-2">
        {segments.map(([k, label]) => (
          <Link key={k} href={`/admin/customers?${new URLSearchParams({ ...(q && { q }), ...(k && { segment: k }) })}`} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${segment === k ? "border-forest bg-forest text-ivory" : "border-line bg-paper text-forest"}`}>
            {label}
          </Link>
        ))}
      </div>
      <DataTable head={["Customer", "Segment", "Orders", "Spent", "Last order", "Since"]} empty={rows.length === 0}>
        {rows.map((c) => (
          <tr key={c.id} className="hover:bg-ivory">
            <Td>
              <Link href={`/admin/customers/${c.id}`} className="font-semibold text-forest hover:underline">
                {c.name || c.email}
              </Link>
              <span className="block text-xs text-muted">
                {c.email}
                {c.phone ? ` · ${c.phone}` : ""}
              </span>
              {c.deletion_requested_at && <Badge tone="bad">deletion requested</Badge>}
            </Td>
            <Td>
              <Badge tone={SEGMENT_TONES[c.segment]}>{SEGMENT_LABELS[c.segment]}</Badge>
              {c.marketing_opt_in && <span className="ml-1 text-xs text-muted">· subscribed</span>}
            </Td>
            <Td>{c.orders}</Td>
            <Td className="whitespace-nowrap font-semibold">{formatINR(c.spent)}</Td>
            <Td className="whitespace-nowrap text-muted">{c.last_order ? new Date(c.last_order).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—"}</Td>
            <Td className="whitespace-nowrap text-muted">{new Date(c.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</Td>
          </tr>
        ))}
      </DataTable>
      {pages > 1 && (
        <div className="mt-4 flex gap-3 text-sm">
          {page > 1 && (
            <Link href={qs({ page: String(page - 1) })} className="font-semibold text-forest underline">
              ← Previous
            </Link>
          )}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link href={qs({ page: String(page + 1) })} className="font-semibold text-forest underline">
              Next →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
