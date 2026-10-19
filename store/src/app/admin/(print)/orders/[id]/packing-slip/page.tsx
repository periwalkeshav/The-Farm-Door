import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { PrintButton } from "@/components/print-button";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { formatAddress, loadOrderItems } from "@/server/orders/common";
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
      <article className="mx-auto max-w-[148mm] bg-white p-8 text-[14px] text-black shadow-lg print:p-0 print:shadow-none">
        <header className="flex items-start justify-between border-b border-black pb-3">
          <div>
            <p className="text-lg font-bold">{store.tradeName}</p>
            <p className="text-xs">Packing slip</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">#{order.orderNumber}</p>
            <p className="text-xs">{order.paymentMethod === "COD" ? `COD · collect ₹${(order.totalPaise / 100).toFixed(2)}` : "PREPAID"}</p>
          </div>
        </header>
        <section className="border-b border-black py-3">
          <p className="text-xs font-bold uppercase">Ship to</p>
          <p className="font-semibold">{order.shipName}</p>
          <p>{formatAddress(order)}</p>
          <p>{order.shipPhone}</p>
        </section>
        <table className="mt-3 w-full">
          <thead>
            <tr className="border-b border-black text-left text-xs uppercase">
              <th className="py-1">✓</th>
              <th className="py-1">Item</th>
              <th className="py-1">SKU</th>
              <th className="py-1 text-right">Qty</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-gray-300">
                <td className="py-2 pr-2">☐</td>
                <td className="py-2">
                  {i.productName}
                  <span className="block text-xs">{i.variantTitle}</span>
                </td>
                <td className="py-2 font-mono text-xs">{i.sku}</td>
                <td className="py-2 text-right text-lg font-bold">{i.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {order.customerNote && <p className="mt-3 text-sm">Note: {order.customerNote}</p>}
        <p className="mt-6 text-xs">Total items: {items.reduce((s, i) => s + i.quantity, 0)}</p>
      </article>
    </>
  );
}
