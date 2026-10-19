/**
 * CSV exports for the admin panel. Amounts are rupees with two decimals.
 * Each export declares the permission it needs; the route checks it.
 */
import { and, asc, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { coupons, inventoryItems, newsletterSubscribers, orderItems, orders, payments, refunds, shipments, stockMovements } from "@/db/schema";
import { listCustomers } from "./customers";
import type { Permission } from "./permissions";
import * as reports from "./reports";

export type Csv = { filename: string; header: string[]; rows: (string | number | null)[][] };
type Ctx = { range: reports.Range; label: string; params: URLSearchParams };

const rs = (paise: number | null | undefined) => (paise === null || paise === undefined ? "" : (paise / 100).toFixed(2));
const ist = (d: Date | null | undefined) => (d ? new Date(d.getTime() + 5.5 * 3600_000).toISOString().replace("T", " ").slice(0, 19) : "");
const pct = (bp: number) => (bp / 100).toFixed(2);

export const EXPORTS: Record<string, { title: string; permission: Permission; dated: boolean; build: (db: DbOrTx, ctx: Ctx) => Promise<Csv> }> = {
  orders: {
    title: "Orders",
    permission: "orders.customerDetails",
    dated: true,
    async build(db, { range, label, params }) {
      const where: (SQL | undefined)[] = [gte(orders.placedAt, range.from), lt(orders.placedAt, range.to)];
      const status = params.get("status");
      if (status) where.push(sql`${orders.status} = ${status}`);
      const method = params.get("method");
      if (method === "COD" || method === "PREPAID") where.push(eq(orders.paymentMethod, method));
      const rows = await db.select().from(orders).where(and(...where)).orderBy(asc(orders.placedAt));
      return {
        filename: `orders-${label}.csv`,
        header: ["Order", "Placed (IST)", "Confirmed (IST)", "Status", "Payment method", "Payment status", "Customer email", "Name", "Phone", "City", "State", "Pincode", "GSTIN", "Items (₹)", "Discount (₹)", "Coupon", "Shipping (₹)", "COD fee (₹)", "Total (₹)", "GST included (₹)", "Courier quote (₹)", "Weight (g)"],
        rows: rows.map((o) => [
          o.orderNumber,
          ist(o.placedAt),
          ist(o.confirmedAt),
          o.status,
          o.paymentMethod,
          o.paymentStatus,
          o.email,
          o.shipName,
          o.shipPhone,
          o.shipCity,
          o.shipState,
          o.shipPincode,
          o.billingGstin,
          rs(o.subtotalPaise),
          rs(o.discountPaise),
          o.couponCode ?? "",
          rs(o.shippingPaise),
          rs(o.codFeePaise),
          rs(o.totalPaise),
          rs(o.taxPaise),
          rs(o.shippingQuote?.quotedCostPaise),
          o.totalWeightGrams,
        ]),
      };
    },
  },
  "order-items": {
    title: "Order lines (confirmed orders)",
    permission: "reports.finance",
    dated: true,
    async build(db, { range, label }) {
      const rows = await db
        .select({ i: orderItems, orderNumber: orders.orderNumber, confirmedAt: orders.confirmedAt, status: orders.status })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(gte(orders.confirmedAt, range.from), lt(orders.confirmedAt, range.to)))
        .orderBy(asc(orders.confirmedAt));
      return {
        filename: `order-lines-${label}.csv`,
        header: ["Order", "Confirmed (IST)", "Order status", "Product", "Variant", "SKU", "HSN", "GST %", "Qty", "Unit price (₹)", "Line before discount (₹)", "Discount (₹)", "Line total (₹)", "Taxable value (₹)", "GST (₹)", "Cost of goods (₹)"],
        rows: rows.map(({ i, orderNumber, confirmedAt, status }) => [
          orderNumber,
          ist(confirmedAt),
          status,
          i.productName,
          i.variantTitle,
          i.sku,
          i.hsnCode,
          pct(i.gstRateBp),
          i.quantity,
          rs(i.unitPricePaise),
          rs(i.lineSubtotalPaise),
          rs(i.discountPaise),
          rs(i.lineTotalPaise),
          rs(i.taxableValuePaise),
          rs(i.taxPaise),
          rs(i.costPaise),
        ]),
      };
    },
  },
  "sales-daily": {
    title: "Sales by day",
    permission: "reports.finance",
    dated: true,
    async build(db, { range, label }) {
      const series = await reports.salesSeries(db, range, "day");
      return { filename: `sales-by-day-${label}.csv`, header: ["Date", "Confirmed orders", "Item sales after discount (₹)"], rows: series.map((p) => [p.bucket, p.orders, rs(p.netPaise)]) };
    },
  },
  products: {
    title: "Product performance",
    permission: "reports.finance",
    dated: true,
    async build(db, { range, label }) {
      const rows = await reports.topProducts(db, range, 1000);
      return {
        filename: `products-${label}.csv`,
        header: ["Product", "Units sold", "Revenue incl. GST (₹)", "Cost of goods (₹)"],
        rows: rows.map((r) => [r.name, r.units, rs(r.revenuePaise), r.costPaise === null ? "unknown" : rs(r.costPaise)]),
      };
    },
  },
  inventory: {
    title: "Stock levels",
    permission: "inventory.view",
    dated: false,
    async build(db) {
      const rows = await db.select().from(inventoryItems).orderBy(asc(inventoryItems.name));
      return {
        filename: `stock-${new Date().toISOString().slice(0, 10)}.csv`,
        header: ["Stock pool", "Code", "Unit", "On hand", "Held", "Available", "Alert at", "Cost (₹ per pack or kg)", "Active"],
        rows: rows.map((r) => [r.name, r.sku, r.unit === "GRAM" ? "grams" : "packs", r.onHand, r.reserved, r.onHand - r.reserved, r.lowStockThreshold, rs(r.unitCostPaise), r.isActive ? "yes" : "no"]),
      };
    },
  },
  "stock-movements": {
    title: "Stock movements",
    permission: "inventory.view",
    dated: true,
    async build(db, { range, label }) {
      const rows = await db
        .select({ m: stockMovements, pool: inventoryItems.name, sku: inventoryItems.sku, orderNumber: orders.orderNumber })
        .from(stockMovements)
        .innerJoin(inventoryItems, eq(inventoryItems.id, stockMovements.inventoryItemId))
        .leftJoin(orders, eq(orders.id, stockMovements.orderId))
        .where(and(gte(stockMovements.createdAt, range.from), lt(stockMovements.createdAt, range.to)))
        .orderBy(asc(stockMovements.createdAt));
      return {
        filename: `stock-movements-${label}.csv`,
        header: ["When (IST)", "Stock pool", "Code", "Reason", "Change on hand", "Change held", "On hand after", "Held after", "Order", "Note"],
        rows: rows.map(({ m, pool, sku, orderNumber }) => [ist(m.createdAt), pool, sku, m.reason, m.changeOnHand, m.changeReserved, m.onHandAfter, m.reservedAfter, orderNumber ?? "", m.note]),
      };
    },
  },
  customers: {
    title: "Customers",
    permission: "customers.view",
    dated: false,
    async build(db, { params }) {
      const rows = await listCustomers(db, { q: params.get("q") ?? undefined, segment: params.get("segment") ?? undefined, limit: 100_000, offset: 0 });
      return {
        filename: `customers-${new Date().toISOString().slice(0, 10)}.csv`,
        header: ["Name", "Email", "Phone", "Completed orders", "Total spent (₹)", "Last order (IST)", "Newsletter", "Customer since (IST)"],
        rows: rows.map((c) => [c.name, c.email, c.phone, c.orders, rs(c.spent), ist(c.last_order ? new Date(c.last_order) : null), c.marketing_opt_in ? "yes" : "no", ist(new Date(c.created_at))]),
      };
    },
  },
  newsletter: {
    title: "Newsletter subscribers",
    permission: "customers.view",
    dated: false,
    async build(db) {
      const rows = await db.select().from(newsletterSubscribers).where(sql`${newsletterSubscribers.unsubscribedAt} is null`).orderBy(asc(newsletterSubscribers.consentedAt));
      return { filename: "newsletter-subscribers.csv", header: ["Email", "Source", "Consented (IST)"], rows: rows.map((r) => [r.email, r.source, ist(r.consentedAt)]) };
    },
  },
  payments: {
    title: "Payments & refunds",
    permission: "reports.finance",
    dated: true,
    async build(db, { range, label }) {
      const pays = await db
        .select({ p: payments, orderNumber: orders.orderNumber })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .where(and(gte(payments.createdAt, range.from), lt(payments.createdAt, range.to)))
        .orderBy(asc(payments.createdAt));
      const refs = await db
        .select({ r: refunds, orderNumber: orders.orderNumber })
        .from(refunds)
        .innerJoin(orders, eq(orders.id, refunds.orderId))
        .where(and(gte(refunds.createdAt, range.from), lt(refunds.createdAt, range.to)))
        .orderBy(asc(refunds.createdAt));
      return {
        filename: `payments-refunds-${label}.csv`,
        header: ["When (IST)", "Type", "Order", "Reference", "Amount (₹)", "Status", "Method", "Gateway fee incl. GST (₹)", "Notes"],
        rows: [
          ...pays.map(({ p, orderNumber }) => [ist(p.createdAt), p.isDuplicate ? "Payment (duplicate)" : "Payment", orderNumber, p.providerPaymentId, rs(p.amountPaise), p.status, p.method, rs((p.feePaise ?? 0) + (p.taxOnFeePaise ?? 0)), p.errorDescription]),
          ...refs.map(({ r, orderNumber }) => [ist(r.createdAt), r.mode === "RAZORPAY" ? "Refund (Razorpay)" : "Refund (manual)", orderNumber, r.providerRefundId ?? r.reference, rs(-r.amountPaise), r.status, "", "", r.reason]),
        ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      };
    },
  },
  coupons: {
    title: "Coupon usage",
    permission: "reports.finance",
    dated: true,
    async build(db, { range, label }) {
      const usage = await reports.couponUsage(db, range);
      const all = await db.select({ code: coupons.code, description: coupons.description }).from(coupons).orderBy(desc(coupons.createdAt));
      return {
        filename: `coupons-${label}.csv`,
        header: ["Code", "Description", "Uses on confirmed orders", "Total discount (₹)"],
        rows: all.map((c) => {
          const u = usage.find((x) => x.code === c.code);
          return [c.code, c.description, u?.uses ?? 0, rs(u?.discountPaise ?? 0)];
        }),
      };
    },
  },
  shipping: {
    title: "Shipments",
    permission: "reports.operations",
    dated: true,
    async build(db, { range, label }) {
      const rows = await db
        .select({ s: shipments, o: orders })
        .from(shipments)
        .innerJoin(orders, eq(orders.id, shipments.orderId))
        .where(and(gte(shipments.createdAt, range.from), lt(shipments.createdAt, range.to)))
        .orderBy(asc(shipments.createdAt));
      return {
        filename: `shipments-${label}.csv`,
        header: ["Order", "Booked (IST)", "Courier", "AWB", "Shipment status", "Order status", "Pincode", "State", "Shipping charged (₹)", "Courier cost (₹)", "Shipped (IST)", "Delivered (IST)"],
        rows: rows.map(({ s, o }) => [o.orderNumber, ist(s.createdAt), s.courierName, s.awb ?? "", s.status, o.status, o.shipPincode, o.shipState, rs(o.shippingPaise), rs(s.costPaise), ist(o.shippedAt), ist(o.deliveredAt)]),
      };
    },
  },
  "gst-register": {
    title: "GST sales register (invoice lines)",
    permission: "reports.finance",
    dated: true,
    async build(db, { range, label }) {
      const rows = await reports.gstRegister(db, range);
      return {
        filename: `gst-sales-register-${label}.csv`,
        header: ["Invoice no.", "Invoice date (IST)", "Order", "Buyer GSTIN (B2B)", "Buyer", "Place of supply", "HSN/SAC", "Description", "Qty", "GST %", "Taxable value (₹)", "CGST (₹)", "SGST (₹)", "IGST (₹)", "Invoice line total (₹)"],
        rows: rows.map((r) => [r.invoice_number, ist(new Date(r.issued_at)), r.order_number, r.buyer_gstin, r.buyer_name, r.place_of_supply, r.hsn, r.description, r.quantity, pct(r.rate_bp), rs(r.taxable), rs(r.cgst), rs(r.sgst), rs(r.igst), rs(r.total)]),
      };
    },
  },
  "hsn-summary": {
    title: "HSN-wise summary",
    permission: "reports.finance",
    dated: true,
    async build(db, { range, label }) {
      const rows = await reports.hsnSummary(db, range);
      return {
        filename: `hsn-summary-${label}.csv`,
        header: ["HSN/SAC", "GST %", "Total quantity", "Taxable value (₹)", "CGST (₹)", "SGST (₹)", "IGST (₹)", "Total value (₹)"],
        rows: rows.map((r) => [r.hsn, pct(r.rate_bp), r.quantity, rs(r.taxable), rs(r.cgst), rs(r.sgst), rs(r.igst), rs(r.total)]),
      };
    },
  },
  "credit-notes": {
    title: "Credit notes",
    permission: "reports.finance",
    dated: true,
    async build(db, { range, label }) {
      const rows = await reports.creditNoteRegister(db, range);
      return {
        filename: `credit-notes-${label}.csv`,
        header: ["Credit note no.", "Date (IST)", "Against invoice", "Amount (₹)", "Taxable value (₹)", "CGST (₹)", "SGST (₹)", "IGST (₹)"],
        rows: rows.map((r) => [r.note_number, ist(new Date(r.issued_at)), r.invoice_number, rs(r.amount), rs(r.taxable), rs(r.cgst), rs(r.sgst), rs(r.igst)]),
      };
    },
  },
};

/** Spreadsheet-safe CSV: quotes everything and defuses formula injection (=, +, -, @ at the start of text). */
export function toCsv(csv: Csv): string {
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return '""';
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return "﻿" + [csv.header, ...csv.rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

