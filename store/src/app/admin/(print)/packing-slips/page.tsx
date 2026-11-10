import { asc, inArray } from "drizzle-orm";
import { Suspense } from "react";
import { PackingSlip } from "@/components/admin/packing-slip";
import { PrintButton } from "@/components/print-button";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { loadOrderItems } from "@/server/orders/common";
import { readSettings } from "@/server/settings";

export const metadata = { title: "Packing slips", robots: { index: false } };

export default function PackingSlipsPage({ searchParams }: PageProps<"/admin/packing-slips">) {
  return (
    <Suspense fallback={null}>
      <Slips searchParams={searchParams} />
    </Suspense>
  );
}

async function Slips({ searchParams }: { searchParams: PageProps<"/admin/packing-slips">["searchParams"] }) {
  await requireStaff("orders.pack");
  const raw = (await searchParams).ids;
  const ids = [...new Set(String(raw ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 100);
  const db = getDb();
  const rows = ids.length ? await db.select().from(orders).where(inArray(orders.id, ids)).orderBy(asc(orders.placedAt)) : [];
  if (!rows.length) return <p className="p-10 text-center">No orders selected.</p>;
  const [store, items] = await Promise.all([readSettings(db, "store"), Promise.all(rows.map((o) => loadOrderItems(db, o.id)))]);
  return (
    <>
      <div className="mx-auto mb-4 flex max-w-[148mm] items-center justify-between print:hidden">
        <p className="text-sm text-muted">
          {rows.length} packing slip{rows.length === 1 ? "" : "s"}, one per page
        </p>
        <PrintButton label="Print all" />
      </div>
      <div className="space-y-6 print:space-y-0">
        {rows.map((o, i) => (
          <PackingSlip key={o.id} order={o} items={items[i]} storeName={store.tradeName} />
        ))}
      </div>
    </>
  );
}
