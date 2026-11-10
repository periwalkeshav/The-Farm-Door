import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { InvoiceDocument } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";
import { getCustomer, getStaffSession, staffSignedIn } from "@/data/session";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { checkOrderToken } from "@/server/orders/common";
import { findOrderByNumber } from "@/server/orders/view";
import { can } from "@/server/permissions";

export const metadata: Metadata = { title: "Tax invoice", robots: { index: false } };

export default function InvoicePage({ params, searchParams }: PageProps<"/[lang]/orders/[number]/invoice">) {
  return (
    <Suspense fallback={null}>
      <InvoiceContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function InvoiceContent({ params, searchParams }: Pick<PageProps<"/[lang]/orders/[number]/invoice">, "params" | "searchParams">) {
  const [{ number }, sp] = await Promise.all([params, searchParams]);
  const db = getDb();
  const order = await findOrderByNumber(db, number);
  const [customer, staff] = await Promise.all([getCustomer(), getStaffSession()]);
  const allowed =
    order &&
    (checkOrderToken(order, typeof sp.t === "string" ? sp.t : undefined) ||
      (customer && order.customerId === customer.id) ||
      (staffSignedIn(staff) && can(staff.role, "orders.view")));
  if (!order || !allowed) return <p className="p-10 text-center">Invoice not found.</p>;
  const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, order.id));
  if (!invoice) return <p className="p-10 text-center">The invoice is issued when your order is packed.</p>;
  return (
    <>
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 print:hidden">
        <a href={`/orders/${order.orderNumber}/invoice.pdf${typeof sp.t === "string" ? `?t=${encodeURIComponent(sp.t)}` : ""}`} className="rounded-full border border-[#1F3B2D] px-5 py-2 text-sm font-semibold text-[#1F3B2D]">
          Download PDF
        </a>
        <PrintButton />
      </div>
      <div className="shadow-lg print:shadow-none">
        <InvoiceDocument title="Tax invoice" number={invoice.invoiceNumber} date={invoice.issuedAt} orderNumber={order.orderNumber} snapshot={invoice.snapshot} />
      </div>
    </>
  );
}
