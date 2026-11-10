import { formatAddress, type OrderItemRow, type OrderRow } from "@/server/orders/common";

/** One packing slip (A5). Printed alone or several to a run, one per page. */
export function PackingSlip({ order, items, storeName }: { order: OrderRow; items: OrderItemRow[]; storeName: string }) {
  return (
    <article className="mx-auto max-w-[148mm] bg-white p-8 text-[14px] text-black shadow-lg print:break-after-page print:p-0 print:shadow-none">
      <header className="flex items-start justify-between border-b border-black pb-3">
        <div>
          <p className="text-lg font-bold">{storeName}</p>
          <p className="text-xs">Packing slip</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">#{order.orderNumber}</p>
          <p className="text-xs">{order.replacementForOrderId ? "FREE REPLACEMENT · no charge" : order.paymentMethod === "COD" ? `COD · collect ₹${(order.totalPaise / 100).toFixed(2)}` : "PREPAID"}</p>
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
  );
}
