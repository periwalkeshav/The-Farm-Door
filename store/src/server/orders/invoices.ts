/**
 * GST tax invoices and credit notes. An invoice is issued when the order is
 * packed (goods are invoiced at dispatch) and its contents are frozen as a
 * snapshot, so later edits to products or settings never change it.
 *
 * Have your CA review the format before going live (see docs/LAUNCH-CHECKLIST.md).
 */
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { creditNotes, invoices, type InvoiceLine, type InvoiceSnapshot } from "@/db/schema";
import { stateCode } from "@/lib/india";
import { splitGst, splitInclusiveTax } from "@/lib/pricing";
import { nextCreditNoteNumber, nextInvoiceNumber } from "../counters";
import { readSettings } from "../settings";
import { env } from "@/lib/env";
import { formatAddress, loadOrderItems, OrderActionError, type OrderRow } from "./common";

export async function buildInvoiceSnapshot(tx: DbOrTx, order: OrderRow): Promise<InvoiceSnapshot> {
  const store = await readSettings(tx, "store");
  const items = await loadOrderItems(tx, order.id);
  const intraState = store.state.trim().toLowerCase() === order.shipState.trim().toLowerCase();

  const lines: InvoiceLine[] = items.map((i) => {
    const gst = splitGst(i.taxPaise, intraState);
    return {
      description: `${i.productName} (${i.variantTitle})`,
      hsnCode: i.hsnCode,
      quantity: i.quantity,
      unitPricePaise: i.unitPricePaise,
      discountPaise: i.discountPaise,
      taxableValuePaise: i.taxableValuePaise,
      gstRateBp: i.gstRateBp,
      cgstPaise: gst.cgst,
      sgstPaise: gst.sgst,
      igstPaise: gst.igst,
      totalPaise: i.lineTotalPaise,
    };
  });

  // Shipping and COD fee are taxed at the rate of the main item (composite supply).
  const principal = [...items].sort((a, b) => b.lineTotalPaise - a.lineTotalPaise || b.gstRateBp - a.gstRateBp)[0];
  const chargeRate = principal?.gstRateBp ?? 0;
  for (const [label, amount] of [
    ["Shipping charges", order.shippingPaise],
    ["Cash on delivery fee", order.codFeePaise],
  ] as const) {
    if (amount <= 0) continue;
    const { taxable, tax } = splitInclusiveTax(amount, chargeRate);
    const gst = splitGst(tax, intraState);
    lines.push({
      description: label,
      hsnCode: "996812", // courier services; confirm with your CA
      quantity: 1,
      unitPricePaise: amount,
      discountPaise: 0,
      taxableValuePaise: taxable,
      gstRateBp: chargeRate,
      cgstPaise: gst.cgst,
      sgstPaise: gst.sgst,
      igstPaise: gst.igst,
      totalPaise: amount,
    });
  }

  const sum = (k: keyof InvoiceLine) => lines.reduce((s, l) => s + (l[k] as number), 0);
  return {
    seller: {
      legalName: store.legalName || store.tradeName,
      tradeName: store.tradeName,
      gstin: store.gstin,
      address: [store.addressLine1, store.addressLine2, `${store.city}, ${store.state} ${store.pincode}`].filter(Boolean).join(", "),
      state: store.state,
      stateCode: stateCode(store.state) ?? "",
      fssaiNumber: store.fssaiNumber,
    },
    buyer: {
      name: order.shipName,
      businessName: order.billingBusinessName,
      gstin: order.billingGstin,
      address: formatAddress(order),
      state: order.shipState,
      stateCode: stateCode(order.shipState) ?? "",
    },
    placeOfSupply: `${order.shipState} (${stateCode(order.shipState) ?? "?"})`,
    intraState,
    lines,
    totals: {
      taxableValuePaise: sum("taxableValuePaise"),
      cgstPaise: sum("cgstPaise"),
      sgstPaise: sum("sgstPaise"),
      igstPaise: sum("igstPaise"),
      totalPaise: sum("totalPaise"),
    },
  };
}

/** Issues the invoice for an order (once). Returns the existing invoice if there is one. */
export async function ensureInvoice(tx: DbOrTx, order: OrderRow) {
  const [existing] = await tx.select().from(invoices).where(eq(invoices.orderId, order.id));
  if (existing) return existing;
  if (env().NODE_ENV === "production") {
    const store = await readSettings(tx, "store");
    const missing = [!store.gstin && "GSTIN", !store.legalName && "legal business name", (!store.addressLine1 || !store.pincode) && "registered address", !store.state && "state"].filter(Boolean);
    if (missing.length) throw new OrderActionError(`Add your ${missing.join(", ")} in Admin > Settings before invoices can be issued.`);
  }
  const now = new Date();
  const { number, financialYear } = await nextInvoiceNumber(tx, now);
  const snapshot = await buildInvoiceSnapshot(tx, order);
  const [created] = await tx
    .insert(invoices)
    .values({ orderId: order.id, invoiceNumber: number, financialYear, isB2b: !!order.billingGstin, snapshot, issuedAt: now })
    .returning();
  return created;
}

/** Credit note for a refund on an invoiced order, reducing each line proportionally. */
export async function issueCreditNote(tx: DbOrTx, orderId: number, refundId: number | null, amountPaise: number) {
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.orderId, orderId));
  if (!invoice) return null;
  const total = invoice.snapshot.totals.totalPaise;
  const ratio = Math.min(1, amountPaise / total);
  const lines = invoice.snapshot.lines.map((l) => {
    const lineTotal = Math.round(l.totalPaise * ratio);
    const { taxable, tax } = splitInclusiveTax(lineTotal, l.gstRateBp);
    const gst = splitGst(tax, invoice.snapshot.intraState);
    return { ...l, discountPaise: 0, unitPricePaise: lineTotal, quantity: 1, totalPaise: lineTotal, taxableValuePaise: taxable, cgstPaise: gst.cgst, sgstPaise: gst.sgst, igstPaise: gst.igst };
  });
  // Put any rounding difference on the largest line so the note equals the refund exactly.
  const diff = amountPaise - lines.reduce((s, l) => s + l.totalPaise, 0);
  if (diff !== 0 && lines.length) {
    const largest = lines.reduce((a, b) => (b.totalPaise > a.totalPaise ? b : a));
    largest.totalPaise += diff;
    largest.unitPricePaise += diff;
    const { taxable, tax } = splitInclusiveTax(largest.totalPaise, largest.gstRateBp);
    const gst = splitGst(tax, invoice.snapshot.intraState);
    Object.assign(largest, { taxableValuePaise: taxable, cgstPaise: gst.cgst, sgstPaise: gst.sgst, igstPaise: gst.igst });
  }
  const sum = (k: keyof InvoiceLine) => lines.reduce((s, l) => s + (l[k] as number), 0);
  const now = new Date();
  const { number, financialYear } = await nextCreditNoteNumber(tx, now);
  const [note] = await tx
    .insert(creditNotes)
    .values({
      invoiceId: invoice.id,
      refundId,
      noteNumber: number,
      financialYear,
      amountPaise,
      snapshot: {
        ...invoice.snapshot,
        lines,
        totals: { taxableValuePaise: sum("taxableValuePaise"), cgstPaise: sum("cgstPaise"), sgstPaise: sum("sgstPaise"), igstPaise: sum("igstPaise"), totalPaise: sum("totalPaise") },
      },
      issuedAt: now,
    })
    .returning();
  return note;
}
