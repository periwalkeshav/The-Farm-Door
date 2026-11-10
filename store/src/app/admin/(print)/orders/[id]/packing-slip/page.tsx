import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { PackingSlip } from "@/components/admin/packing-slip";
import { PrintButton } from "@/components/print-button";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { loadOrderItems } from "@/server/orders/common";
import { readSettings } from "@/server/settings";

export const metadata = { title: "Packing slip", robots: { index: false } };

export default function PackingSlipPage({ params }: PageProps<"/admin/orders/[id]/packing-slip">) {
  return (
    <Suspense fallback={null}>
      <Slip params={params} />
    </Suspense>
  );
}

async function Slip({ params }: { params: PageProps<"/admin/orders/[id]/packing-slip">["params"] }) {
  await requireStaff("orders.pack");
  const id = Number((await params).id);
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) return <p className="p-10 text-center">Order not found.</p>;
  const [items, store] = await Promise.all([loadOrderItems(db, order.id), readSettings(db, "store")]);
  return (
    <>
      <div className="mx-auto mb-4 flex max-w-[148mm] justify-end print:hidden">
        <PrintButton label="Print packing slip" />
      </div>
      <PackingSlip order={order} items={items} storeName={store.tradeName} />
    </>
  );
}
