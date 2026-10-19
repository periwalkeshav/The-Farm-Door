import type { InvoiceSnapshot } from "@/db/schema";
import { formatINRExact } from "@/lib/money";

/** Printable GST tax invoice (or credit note). Rendered only from the frozen snapshot. */
export function InvoiceDocument({ title, number, date, orderNumber, snapshot }: { title: string; number: string; date: Date; orderNumber: string; snapshot: InvoiceSnapshot }) {
  const s = snapshot;
  const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%`;
  return (
    <article className="mx-auto max-w-[210mm] bg-white p-8 text-[13px] text-black print:p-0">
      <header className="flex items-start justify-between gap-6 border-b border-black pb-4">
        <div>
          <p className="text-xl font-bold">{s.seller.legalName}</p>
          {s.seller.tradeName && s.seller.tradeName !== s.seller.legalName && <p>Trade name: {s.seller.tradeName}</p>}
          <p>{s.seller.address}</p>
          <p>GSTIN: {s.seller.gstin || "—"}</p>
          <p>
            State: {s.seller.state} ({s.seller.stateCode})
          </p>
          {s.seller.fssaiNumber && <p>FSSAI Lic. No.: {s.seller.fssaiNumber}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold uppercase">{title}</p>
          <p>No. {number}</p>
          <p>Date: {date.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" })}</p>
          <p>Order: {orderNumber}</p>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-6 border-b border-black py-4">
        <div>
          <p className="font-bold">Bill to / Ship to</p>
          {s.buyer.businessName && <p>{s.buyer.businessName}</p>}
          <p>{s.buyer.name}</p>
          <p>{s.buyer.address}</p>
          {s.buyer.gstin && <p>GSTIN: {s.buyer.gstin}</p>}
        </div>
        <div>
          <p>
            <span className="font-bold">Place of supply:</span> {s.placeOfSupply}
          </p>
          <p>
            <span className="font-bold">Tax type:</span> {s.intraState ? "CGST + SGST (intra-state)" : "IGST (inter-state)"}
          </p>
          <p>Reverse charge: No</p>
        </div>
      </section>
      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Description</th>
            <th className="py-1 pr-2">HSN/SAC</th>
            <th className="py-1 pr-2 text-right">Qty</th>
            <th className="py-1 pr-2 text-right">Rate (incl. GST)</th>
            <th className="py-1 pr-2 text-right">Discount</th>
            <th className="py-1 pr-2 text-right">Taxable value</th>
            <th className="py-1 pr-2 text-right">GST</th>
            {s.intraState ? (
              <>
                <th className="py-1 pr-2 text-right">CGST</th>
                <th className="py-1 pr-2 text-right">SGST</th>
              </>
            ) : (
              <th className="py-1 pr-2 text-right">IGST</th>
            )}
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {s.lines.map((l, i) => (
            <tr key={i} className="border-b border-gray-300 align-top">
              <td className="py-1 pr-2">{i + 1}</td>
              <td className="py-1 pr-2">{l.description}</td>
              <td className="py-1 pr-2">{l.hsnCode}</td>
              <td className="py-1 pr-2 text-right">{l.quantity}</td>
              <td className="py-1 pr-2 text-right">{formatINRExact(l.unitPricePaise)}</td>
              <td className="py-1 pr-2 text-right">{l.discountPaise ? formatINRExact(l.discountPaise) : "—"}</td>
              <td className="py-1 pr-2 text-right">{formatINRExact(l.taxableValuePaise)}</td>
              <td className="py-1 pr-2 text-right">{pct(l.gstRateBp)}</td>
              {s.intraState ? (
                <>
                  <td className="py-1 pr-2 text-right">{formatINRExact(l.cgstPaise)}</td>
                  <td className="py-1 pr-2 text-right">{formatINRExact(l.sgstPaise)}</td>
                </>
              ) : (
                <td className="py-1 pr-2 text-right">{formatINRExact(l.igstPaise)}</td>
              )}
              <td className="py-1 text-right">{formatINRExact(l.totalPaise)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-black font-bold">
            <td colSpan={6} className="py-2 pr-2 text-right">
              Totals
            </td>
            <td className="py-2 pr-2 text-right">{formatINRExact(s.totals.taxableValuePaise)}</td>
            <td />
            {s.intraState ? (
              <>
                <td className="py-2 pr-2 text-right">{formatINRExact(s.totals.cgstPaise)}</td>
                <td className="py-2 pr-2 text-right">{formatINRExact(s.totals.sgstPaise)}</td>
              </>
            ) : (
              <td className="py-2 pr-2 text-right">{formatINRExact(s.totals.igstPaise)}</td>
            )}
            <td className="py-2 text-right">{formatINRExact(s.totals.totalPaise)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-6 text-[11px] text-gray-600">This is a computer-generated document and does not require a signature.</p>
    </article>
  );
}
