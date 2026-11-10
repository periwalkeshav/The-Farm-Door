/**
 * GST tax invoices and credit notes as PDF files, for email attachments and
 * downloads. Drawn from the same frozen snapshot as the printable page
 * (src/components/invoice-document.tsx), so the two always match.
 *
 * Uses the PDF standard fonts (no font files to ship). They have no ₹ sign,
 * so amounts are shown in rupees under "(Rs.)" column headings, and they only
 * cover Western European letters: text in other scripts (say, an address
 * typed in Hindi) shows as "?" in the PDF. The printable invoice page shows it
 * correctly.
 */
import PDFDocument from "pdfkit";
import type { InvoiceSnapshot } from "@/db/schema";

const MARGIN = 36;
const A4 = { width: 595.28, height: 841.89 };
const WIDTH = A4.width - MARGIN * 2;

/** Keeps text to what the standard PDF fonts can draw (Windows-1252). */
function pdfSafe(text: string) {
  return text
    .replace(/₹\s?/g, "Rs. ")
    .normalize("NFKC")
    .replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•…€™]/g, "?");
}

const rupees = (paise: number) => (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 ? 2 : 0)}%`;
const ist = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });

type Column = { label: string; width: number; align: "left" | "right"; value: (l: InvoiceSnapshot["lines"][number], i: number) => string };

export async function invoicePdf({ title, number, date, orderNumber, snapshot: s }: { title: string; number: string; date: Date; orderNumber: string; snapshot: InvoiceSnapshot }): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, info: { Title: pdfSafe(`${title} ${number}`), Author: pdfSafe(s.seller.legalName), Subject: `Order ${orderNumber}` } });
  // Every string drawn or measured goes through pdfSafe.
  const write = doc.text.bind(doc);
  doc.text = ((value: string, ...rest: unknown[]) => (write as (...args: unknown[]) => PDFKit.PDFDocument)(pdfSafe(String(value)), ...rest)) as typeof doc.text;
  const measure = doc.heightOfString.bind(doc);
  doc.heightOfString = ((value: string, options?: PDFKit.Mixins.TextOptions) => measure(pdfSafe(String(value)), options)) as typeof doc.heightOfString;
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  /* Seller and document details */
  const top = doc.y;
  doc.font("Helvetica-Bold").fontSize(14).text(s.seller.legalName, MARGIN, top, { width: WIDTH * 0.6 });
  doc.font("Helvetica").fontSize(9);
  const sellerLines = [
    s.seller.tradeName && s.seller.tradeName !== s.seller.legalName ? `Trade name: ${s.seller.tradeName}` : "",
    s.seller.address,
    `GSTIN: ${s.seller.gstin || "-"}`,
    `State: ${s.seller.state} (${s.seller.stateCode})`,
    s.seller.cin ? `CIN: ${s.seller.cin}` : "",
    s.seller.fssaiNumber ? `FSSAI Lic. No.: ${s.seller.fssaiNumber}` : "",
  ].filter(Boolean);
  for (const line of sellerLines) doc.text(line, { width: WIDTH * 0.6 });
  const leftBottom = doc.y;
  doc.font("Helvetica-Bold").fontSize(13).text(title.toUpperCase(), MARGIN, top, { width: WIDTH, align: "right" });
  doc.font("Helvetica").fontSize(9);
  for (const line of [`No. ${number}`, `Date: ${ist(date)}`, `Order: ${orderNumber}`]) doc.text(line, { width: WIDTH, align: "right" });
  doc.y = Math.max(leftBottom, doc.y) + 8;
  rule(doc);

  /* Buyer and supply details */
  const buyerTop = doc.y + 8;
  doc.font("Helvetica-Bold").text("Bill to / Ship to", MARGIN, buyerTop, { width: WIDTH / 2 - 10 });
  doc.font("Helvetica");
  for (const line of [s.buyer.businessName, s.buyer.name, s.buyer.address, s.buyer.gstin ? `GSTIN: ${s.buyer.gstin}` : ""].filter(Boolean)) doc.text(line, { width: WIDTH / 2 - 10 });
  const buyerBottom = doc.y;
  doc.text(`Place of supply: ${s.placeOfSupply}`, MARGIN + WIDTH / 2, buyerTop, { width: WIDTH / 2 });
  doc.text(`Tax type: ${s.intraState ? "CGST + SGST (intra-state)" : "IGST (inter-state)"}`, { width: WIDTH / 2 });
  doc.text("Reverse charge: No", { width: WIDTH / 2 });
  doc.y = Math.max(buyerBottom, doc.y) + 8;
  rule(doc);

  /* Lines */
  const columns: Column[] = [
    { label: "#", width: 14, align: "left", value: (_l, i) => String(i + 1) },
    { label: "Description", width: 0, align: "left", value: (l) => l.description },
    { label: "HSN/SAC", width: 46, align: "left", value: (l) => l.hsnCode },
    { label: "Qty", width: 22, align: "right", value: (l) => String(l.quantity) },
    { label: "Rate incl. GST (Rs.)", width: 52, align: "right", value: (l) => rupees(l.unitPricePaise) },
    { label: "Discount (Rs.)", width: 42, align: "right", value: (l) => (l.discountPaise ? rupees(l.discountPaise) : "-") },
    { label: "Taxable value (Rs.)", width: 54, align: "right", value: (l) => rupees(l.taxableValuePaise) },
    { label: "GST", width: 28, align: "right", value: (l) => pct(l.gstRateBp) },
    ...(s.intraState
      ? [
          { label: "CGST (Rs.)", width: 42, align: "right" as const, value: (l: InvoiceSnapshot["lines"][number]) => rupees(l.cgstPaise) },
          { label: "SGST (Rs.)", width: 42, align: "right" as const, value: (l: InvoiceSnapshot["lines"][number]) => rupees(l.sgstPaise) },
        ]
      : [{ label: "IGST (Rs.)", width: 84, align: "right" as const, value: (l: InvoiceSnapshot["lines"][number]) => rupees(l.igstPaise) }]),
    { label: "Total (Rs.)", width: 54, align: "right", value: (l) => rupees(l.totalPaise) },
  ];
  columns[1].width = WIDTH - columns.reduce((sum, c) => sum + c.width, 0);

  const drawRow = (cells: string[], bold: boolean) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5);
    const height = Math.max(...cells.map((text, i) => doc.heightOfString(text, { width: columns[i].width - 4 }))) + 6;
    if (doc.y + height > A4.height - MARGIN - 30) {
      doc.addPage();
      if (!bold) drawRow(columns.map((c) => c.label), true);
    }
    const y = doc.y;
    let x = MARGIN;
    cells.forEach((text, i) => {
      doc.text(text, x + (columns[i].align === "right" ? 0 : 2), y + 3, { width: columns[i].width - 4, align: columns[i].align });
      x += columns[i].width;
    });
    doc.y = y + height;
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + WIDTH, doc.y).lineWidth(bold ? 0.8 : 0.3).strokeColor(bold ? "#000000" : "#999999").stroke();
  };

  doc.y += 6;
  drawRow(columns.map((c) => c.label), true);
  s.lines.forEach((line, i) => drawRow(columns.map((c) => c.value(line, i)), false));

  const totals = columns.map(() => "");
  totals[1] = "Totals";
  totals[columns.findIndex((c) => c.label.startsWith("Taxable"))] = rupees(s.totals.taxableValuePaise);
  if (s.intraState) {
    totals[columns.findIndex((c) => c.label.startsWith("CGST"))] = rupees(s.totals.cgstPaise);
    totals[columns.findIndex((c) => c.label.startsWith("SGST"))] = rupees(s.totals.sgstPaise);
  } else {
    totals[columns.findIndex((c) => c.label.startsWith("IGST"))] = rupees(s.totals.igstPaise);
  }
  totals[columns.length - 1] = rupees(s.totals.totalPaise);
  drawRow(totals, true);

  doc.moveDown(1.2);
  doc.font("Helvetica-Bold").fontSize(10).text(`Amount: Rs. ${rupees(s.totals.totalPaise)} (including GST)`, MARGIN, doc.y, { width: WIDTH, align: "right" });
  doc.moveDown(1.5);
  doc.font("Helvetica").fontSize(8).fillColor("#555555").text("This is a computer-generated document and does not require a signature.", MARGIN, doc.y, { width: WIDTH });
  doc.end();
  return done;
}

function rule(doc: PDFKit.PDFDocument) {
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + WIDTH, doc.y).lineWidth(0.8).strokeColor("#000000").stroke();
}

export function invoiceFilename(kind: "invoice" | "credit-note", number: string) {
  return `${kind === "invoice" ? "Invoice" : "Credit-note"}-${number.replace(/[^A-Za-z0-9-]/g, "-")}.pdf`;
}
