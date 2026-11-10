import { eq } from "drizzle-orm";
import { getCustomer, getStaffSession, staffSignedIn } from "@/data/session";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { checkOrderToken } from "@/server/orders/common";
import { invoiceFilename, invoicePdf } from "@/server/orders/invoice-pdf";
import { findOrderByNumber } from "@/server/orders/view";
import { can } from "@/server/permissions";

/** The tax invoice as a PDF download, for the customer (link token or signed in) or staff. */
export async function GET(request: Request, ctx: RouteContext<"/[lang]/orders/[number]/invoice.pdf">) {
  const { number } = await ctx.params;
  const db = getDb();
  const order = await findOrderByNumber(db, number);
  const [customer, staff] = await Promise.all([getCustomer(), getStaffSession()]);
  const allowed =
    order &&
    (checkOrderToken(order, new URL(request.url).searchParams.get("t")) ||
      (customer && order.customerId === customer.id) ||
      (staffSignedIn(staff) && can(staff.role, "orders.view")));
  if (!order || !allowed) return new Response("Invoice not found.", { status: 404 });
  const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, order.id));
  if (!invoice) return new Response("The invoice is issued when your order is packed.", { status: 404 });
  const pdf = await invoicePdf({ title: "Tax invoice", number: invoice.invoiceNumber, date: invoice.issuedAt, orderNumber: order.orderNumber, snapshot: invoice.snapshot });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoiceFilename("invoice", invoice.invoiceNumber)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
