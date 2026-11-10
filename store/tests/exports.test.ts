import { beforeEach, describe, expect, it } from "vitest";
import { addToCart, createCart } from "@/server/cart";
import { summarizeCart } from "@/server/checkout";
import { resolveRange } from "@/server/date-ranges";
import { EXPORTS, toCsv } from "@/server/exports";
import { codConfirmToken } from "@/server/orders/common";
import { confirmCodOrder, packOrder } from "@/server/orders/lifecycle";
import { placeOrder } from "@/server/orders/place";
import { istToday, rangeFromDates } from "@/server/reports";
import { storeSettingsSchema, writeSettings } from "@/server/settings";
import { db, makeProductWithVariant, makeStaff, resetDb } from "./support/db";

/** Places, confirms and packs a two-pack COD order, so it has a GST invoice. */
async function invoicedOrder(to: { city: string; state: string; pincode: string }) {
  const { variant } = await makeProductWithVariant({ pricePaise: 19_900 });
  const cart = await createCart(db, null);
  await addToCart(db, cart.id, variant.id, 2);
  const summary = await summarizeCart(db, { cartId: cart.id, couponCode: null, pincode: to.pincode, paymentMethod: "COD", email: "asha@example.com" });
  const r = await placeOrder(db, {
    cartId: cart.id,
    couponCode: null,
    signedInCustomerId: null,
    idempotencyKey: crypto.randomUUID(),
    email: "asha@example.com",
    phone: "9829012345",
    name: "Asha Verma",
    line1: "12 Civil Lines",
    line2: "",
    landmark: "",
    gstin: "",
    businessName: "",
    paymentMethod: "COD",
    expectedTotalPaise: summary.breakdown.totalPaise!,
    marketingOptIn: false,
    saveAddress: false,
    note: "",
    ...to,
  });
  if (!r.ok) throw new Error(r.message);
  await confirmCodOrder(db, r.order.id, { token: codConfirmToken(r.order) });
  const packed = await packOrder(db, r.order.id, (await makeStaff()).id);
  if (!packed.ok) throw new Error("packing failed");
  return r.order;
}

const today = () => {
  const d = istToday();
  return { range: rangeFromDates(d, d), label: d, params: new URLSearchParams() };
};
const column = (csv: { header: string[] }, name: string) => csv.header.indexOf(name);

describe("report date ranges", () => {
  const now = new Date("2026-01-15T10:00:00+05:30");

  it("defaults to the last 30 days, by day", () => {
    expect(resolveRange({}, now)).toMatchObject({ key: "30d", label: "Last 30 days", fromDate: "2025-12-17", toDate: "2026-01-15", unit: "day" });
  });

  it("resolves the presets in Indian time, across year and financial-year boundaries", () => {
    expect(resolveRange({ range: "lastmonth" }, now)).toMatchObject({ fromDate: "2025-12-01", toDate: "2025-12-31" });
    expect(resolveRange({ range: "mtd" }, now)).toMatchObject({ fromDate: "2026-01-01", toDate: "2026-01-15" });
    expect(resolveRange({ range: "90d" }, now)).toMatchObject({ fromDate: "2025-10-18", unit: "week" });
    expect(resolveRange({ range: "fytd" }, now)).toMatchObject({ fromDate: "2025-04-01", unit: "month" });
    // 31 March 20:00 UTC is already 1 April in India: a new financial year.
    expect(resolveRange({ range: "fytd" }, new Date("2026-03-31T20:00:00Z"))).toMatchObject({ fromDate: "2026-04-01", toDate: "2026-04-01" });
  });

  it("accepts a valid custom range, stops it at today, and ignores invalid ones", () => {
    expect(resolveRange({ range: "custom", from: "2026-01-01", to: "2026-02-10" }, now)).toMatchObject({ fromDate: "2026-01-01", toDate: "2026-01-15", label: "2026-01-01 to 2026-01-15" });
    expect(resolveRange({ range: "custom", from: "2026-01-10", to: "2026-01-01" }, now)).toMatchObject({ label: "Last 30 days", fromDate: "2025-12-17" });
    expect(resolveRange({ range: "custom", from: "2026-13-40", to: "2026-01-01" }, now)).toMatchObject({ label: "Last 30 days" });
  });

  it("covers whole Indian days as a half-open range", () => {
    const { range } = resolveRange({ range: "today" }, now);
    expect(range.from.toISOString()).toBe("2026-01-14T18:30:00.000Z");
    expect(range.to.toISOString()).toBe("2026-01-15T18:30:00.000Z");
  });
});

describe("CSV files", () => {
  it("quotes every cell and defuses spreadsheet formulas, but leaves negative amounts alone", () => {
    const text = toCsv({ filename: "x.csv", header: ["A", "B"], rows: [["=HYPERLINK(\"http://x\")", "-12.50"], ["@cmd", null], ['Say "hi"', 3]] });
    expect(text.startsWith("﻿")).toBe(true); // so Excel opens ₹ and Hindi correctly
    expect(text.slice(1).split("\r\n")).toEqual(['"A","B"', '"\'=HYPERLINK(""http://x"")","-12.50"', '"\'@cmd",""', '"Say ""hi""","3"', ""]);
  });
});

describe("GST exports", () => {
  beforeEach(async () => {
    await resetDb();
    await writeSettings(db, "shipping", {
      pickupPincode: "302001",
      freeShippingThresholdPaise: null,
      handlingFeePaise: 0,
      packagingWeightGrams: 80,
      boxLengthCm: 20,
      boxBreadthCm: 15,
      boxHeightCm: 10,
      courierChoice: "RECOMMENDED",
    });
    await writeSettings(db, "store", { ...storeSettingsSchema.parse({}), state: "Rajasthan", gstin: "08ABCDE1234F1Z5" });
  });

  it("splits CGST and SGST within Rajasthan, charges IGST elsewhere, and the HSN summary adds up", async () => {
    const local = await invoicedOrder({ city: "Jaipur", state: "Rajasthan", pincode: "302017" });
    const away = await invoicedOrder({ city: "Bengaluru", state: "Karnataka", pincode: "560001" });

    // One goods line and one shipping line (SAC 996812) per invoice.
    const register = await EXPORTS["gst-register"].build(db, today());
    expect(register.rows.map((r) => [r[column(register, "Order")], r[column(register, "HSN/SAC")]])).toEqual([
      [local.orderNumber, "09103030"],
      [local.orderNumber, "996812"],
      [away.orderNumber, "09103030"],
      [away.orderNumber, "996812"],
    ]);
    const num = (row: (string | number | null)[], name: string) => Number(row[column(register, name)]);
    const paise = (row: (string | number | null)[], name: string) => Math.round(num(row, name) * 100);
    const linesOf = (orderNumber: string) => register.rows.filter((r) => r[column(register, "Order")] === orderNumber);

    for (const row of linesOf(local.orderNumber)) {
      expect(row[column(register, "Place of supply")]).toBe("Rajasthan (08)");
      expect(num(row, "CGST (₹)")).toBeGreaterThan(0);
      // An odd paisa of tax goes to one half, so the two halves differ by at most 1 paisa.
      expect(Math.abs(paise(row, "CGST (₹)") - paise(row, "SGST (₹)"))).toBeLessThanOrEqual(1);
      expect(num(row, "IGST (₹)")).toBe(0);
    }
    for (const row of linesOf(away.orderNumber)) {
      expect(row[column(register, "Place of supply")]).toBe("Karnataka (29)");
      expect(num(row, "IGST (₹)")).toBeGreaterThan(0);
      expect(num(row, "CGST (₹)") + num(row, "SGST (₹)")).toBe(0);
    }
    for (const row of register.rows) {
      expect(row[column(register, "GST %")]).toBe("5.00");
      // Taxable value plus tax is the line total, to the paisa.
      const tax = paise(row, "CGST (₹)") + paise(row, "SGST (₹)") + paise(row, "IGST (₹)");
      expect(paise(row, "Taxable value (₹)") + tax).toBe(paise(row, "Invoice line total (₹)"));
    }
    // Each invoice's lines add up to what the customer paid.
    for (const order of [local, away]) {
      expect(linesOf(order.orderNumber).reduce((s, r) => s + paise(r, "Invoice line total (₹)"), 0)).toBe(order.totalPaise);
    }

    const hsn = await EXPORTS["hsn-summary"].build(db, today());
    expect(hsn.rows.map((r) => [r[0], r[1], r[2]])).toEqual([
      ["09103030", "5.00", 4],
      ["996812", "5.00", 2],
    ]);
    for (const line of hsn.rows) {
      const lines = register.rows.filter((r) => r[column(register, "HSN/SAC")] === line[0]);
      expect(Math.round(Number(line[3]) * 100)).toBe(lines.reduce((s, r) => s + paise(r, "Taxable value (₹)"), 0));
      expect(Math.round(Number(line[7]) * 100)).toBe(lines.reduce((s, r) => s + paise(r, "Invoice line total (₹)"), 0));
    }
  });

  it("lists orders with rupee totals, and leaves out invoices from other days", async () => {
    const order = await invoicedOrder({ city: "Jaipur", state: "Rajasthan", pincode: "302017" });
    const csv = await EXPORTS.orders.build(db, today());
    expect(csv.rows).toHaveLength(1);
    expect(csv.rows[0][column(csv, "Total (₹)")]).toBe((order.totalPaise / 100).toFixed(2));
    expect(csv.rows[0][column(csv, "Payment method")]).toBe("COD");

    const yesterday = rangeFromDates("2020-01-01", "2020-01-01");
    expect((await EXPORTS["gst-register"].build(db, { ...today(), range: yesterday })).rows).toEqual([]);
  });
});
