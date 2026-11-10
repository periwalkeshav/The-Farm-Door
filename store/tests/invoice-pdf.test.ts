import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { emailLog, invoices, shipments } from "@/db/schema";
import { codConfirmToken } from "@/server/orders/common";
import { invoicePdf } from "@/server/orders/invoice-pdf";
import { applyShipmentUpdate, confirmCodOrder, packOrder, refundOrder } from "@/server/orders/lifecycle";
import { db, makeStaff, resetDb } from "./support/db";
import { placedOrder } from "./support/orders";

describe("PDF invoices", () => {
  beforeEach(resetDb);

  it("attaches the tax invoice to the shipped email and the credit note to the refund email", async () => {
    const staff = await makeStaff();
    const placed = await placedOrder("COD");
    await confirmCodOrder(db, placed.order.id, { token: codConfirmToken(placed.order) });
    const packed = await packOrder(db, placed.order.id, staff.id);
    expect(packed.ok).toBe(true);
    const [shipment] = await db.select().from(shipments).where(eq(shipments.orderId, placed.order.id));
    await applyShipmentUpdate(db, shipment.id, { status: "IN_TRANSIT" });
    const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, placed.order.id));
    const [shipped] = await db.select().from(emailLog).where(eq(emailLog.template, "order-shipped"));
    expect(shipped.attachments).toEqual([`Invoice-${invoice.invoiceNumber.replace(/[^A-Za-z0-9-]/g, "-")}.pdf`]);
    expect(shipped.html).toContain("tax invoice is attached");

    await applyShipmentUpdate(db, shipment.id, { status: "DELIVERED" });
    await refundOrder(db, placed.order.id, { amountPaise: 5_000, reason: "Damaged jar", staffUserId: staff.id, mode: "MANUAL", reference: "UPI-1" });
    const [refund] = await db.select().from(emailLog).where(eq(emailLog.template, "refund"));
    expect(refund.attachments[0]).toMatch(/^Credit-note-.*\.pdf$/);
  });

  it("produces a valid PDF that lists every line, across pages when long", async () => {
    const line = { description: "Turmeric powder (250 g)", hsnCode: "09103030", quantity: 2, unitPricePaise: 19_900, discountPaise: 0, taxableValuePaise: 37_905, gstRateBp: 500, cgstPaise: 948, sgstPaise: 947, igstPaise: 0, totalPaise: 39_800 };
    const pdf = await invoicePdf({
      title: "Tax invoice",
      number: "TFD/2026-27/0001",
      date: new Date("2026-11-10T06:00:00Z"),
      orderNumber: "100042",
      snapshot: {
        seller: { legalName: "Farm Door Foods Pvt Ltd", tradeName: "The Farm Door", gstin: "08ABCDE1234F1Z5", address: "1 MI Road, Jaipur, Rajasthan 302001", state: "Rajasthan", stateCode: "08", fssaiNumber: "", cin: "" },
        buyer: { name: "Kiran Rao", businessName: "", gstin: "", address: "4 MG Road, Jaipur", state: "Rajasthan", stateCode: "08" },
        placeOfSupply: "Rajasthan (08)",
        intraState: true,
        lines: Array.from({ length: 60 }, () => line),
        totals: { taxableValuePaise: 37_905 * 60, cgstPaise: 948 * 60, sgstPaise: 947 * 60, igstPaise: 0, totalPaise: 39_800 * 60 },
      },
    });
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
});
