/**
 * Transactional email templates. Plain HTML with inline styles (email clients
 * ignore stylesheets). Every value from the database is escaped.
 */
import { formatINR } from "@/lib/money";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Rendered = { subject: string; html: string; text: string };

const C = { ivory: "#F7F2E8", paper: "#FFFDF8", forest: "#1F3B2D", ink: "#27231F", muted: "#6A6158", line: "#DDD3C1", saffron: "#A8641A" };

function layout(opts: { preheader: string; heading: string; body: string; footer?: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${C.ivory};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.ink}">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ivory};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:8px 4px 20px;font-family:Georgia,serif;font-size:22px;font-weight:bold;color:${C.forest}">The Farm Door</td></tr>
<tr><td style="background:${C.paper};border:1px solid ${C.line};border-radius:16px;padding:28px 24px">
<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:24px;line-height:1.25;color:${C.forest}">${esc(opts.heading)}</h1>
${opts.body}
</td></tr>
<tr><td style="padding:18px 4px;font-size:12px;line-height:1.6;color:${C.muted}">${opts.footer ?? "You're receiving this email because of an order or sign-in at thefarmdoor.com."}</td></tr>
</table></td></tr></table></body></html>`;
}

function p(text: string) {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${text}</p>`;
}

function button(href: string, label: string) {
  return `<p style="margin:22px 0"><a href="${esc(href)}" style="display:inline-block;background:${C.forest};color:${C.ivory};text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">${esc(label)}</a></p>`;
}

export type EmailOrder = {
  orderNumber: string;
  shipName: string;
  totalPaise: number;
  paymentMethod: "PREPAID" | "COD";
  items: { productName: string; variantTitle: string; quantity: number; lineTotalPaise: number }[];
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  address: string;
};

function itemsTable(order: EmailOrder) {
  const rows = order.items
    .map(
      (i) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.line};font-size:14px">${esc(i.productName)}<br><span style="color:${C.muted};font-size:13px">${esc(i.variantTitle)} × ${i.quantity}</span></td>
<td style="padding:8px 0;border-bottom:1px solid ${C.line};font-size:14px;text-align:right;white-space:nowrap">${esc(formatINR(i.lineTotalPaise))}</td></tr>`,
    )
    .join("");
  const line = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:4px 0;font-size:14px;${bold ? "font-weight:bold" : `color:${C.muted}`}">${label}</td><td style="padding:4px 0;font-size:14px;text-align:right;${bold ? "font-weight:bold" : ""}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px">${rows}
${order.discountPaise ? line("Discount", `−${esc(formatINR(order.discountPaise))}`) : ""}
${line("Shipping", order.shippingPaise ? esc(formatINR(order.shippingPaise)) : "Free")}
${order.codFeePaise ? line("Cash on delivery fee", esc(formatINR(order.codFeePaise))) : ""}
${line(order.paymentMethod === "COD" ? "To pay on delivery" : "Total paid", esc(formatINR(order.totalPaise)), true)}
</table>
<p style="margin:0 0 4px;font-size:13px;color:${C.muted}">Delivering to</p>
<p style="margin:0 0 14px;font-size:14px;line-height:1.5">${esc(order.shipName)}<br>${esc(order.address)}</p>`;
}

export function loginCodeEmail(code: string): Rendered {
  return {
    subject: `${code} is your The Farm Door sign-in code`,
    text: `Your sign-in code is ${code}. It expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
    html: layout({
      preheader: `Your sign-in code is ${code}`,
      heading: "Your sign-in code",
      body: `${p("Enter this code to sign in. It expires in 10 minutes.")}
<p style="margin:8px 0 18px;font-size:32px;letter-spacing:8px;font-weight:bold;color:${C.forest}">${esc(code)}</p>
${p(`<span style="color:${C.muted}">If you didn't ask for this code, you can safely ignore this email.</span>`)}`,
    }),
  };
}

export function codConfirmEmail(order: EmailOrder, confirmUrl: string, hours: number): Rendered {
  return {
    subject: `Please confirm your cash-on-delivery order ${order.orderNumber}`,
    text: `Thanks for your order ${order.orderNumber}. Please confirm it within ${hours} hours so we can pack it: ${confirmUrl}`,
    html: layout({
      preheader: "One click to confirm your order",
      heading: "Please confirm your order",
      body: `${p(`Thanks, ${esc(order.shipName)}! You chose cash on delivery for order <strong>${esc(order.orderNumber)}</strong>. Please confirm it within ${hours} hours so we can pack it.`)}
${button(confirmUrl, "Confirm my order")}${itemsTable(order)}
${p(`<span style="color:${C.muted}">If you didn't place this order, just ignore this email and it will be cancelled automatically.</span>`)}`,
    }),
  };
}

export function orderConfirmedEmail(order: EmailOrder, orderUrl: string): Rendered {
  return {
    subject: `Order confirmed: ${order.orderNumber}`,
    text: `Thanks for your order ${order.orderNumber}. We'll email you when it ships. View your order: ${orderUrl}`,
    html: layout({
      preheader: "We've received your order and are getting it ready.",
      heading: "Thank you for your order",
      body: `${p(`Hi ${esc(order.shipName)}, your order <strong>${esc(order.orderNumber)}</strong> is confirmed. We'll email you the tracking link as soon as it ships.`)}
${itemsTable(order)}${button(orderUrl, "View your order")}`,
    }),
  };
}

export function orderShippedEmail(order: EmailOrder, info: { courier: string; awb: string; trackingUrl: string; orderUrl: string }): Rendered {
  return {
    subject: `Your order ${order.orderNumber} has shipped`,
    text: `Your order ${order.orderNumber} is on its way with ${info.courier} (AWB ${info.awb}). Track it: ${info.trackingUrl || info.orderUrl}`,
    html: layout({
      preheader: `On its way with ${info.courier}`,
      heading: "Your order is on its way",
      body: `${p(`Good news! Order <strong>${esc(order.orderNumber)}</strong> has shipped with <strong>${esc(info.courier)}</strong>.`)}
${p(`Tracking number (AWB): <strong>${esc(info.awb)}</strong>`)}
${button(info.trackingUrl || info.orderUrl, "Track your parcel")}`,
    }),
  };
}

export function orderDeliveredEmail(order: EmailOrder, orderUrl: string): Rendered {
  return {
    subject: `Delivered: ${order.orderNumber}`,
    text: `Your order ${order.orderNumber} has been delivered. If anything is damaged, wrong or expired, tell us within 48 hours: ${orderUrl}`,
    html: layout({
      preheader: "Your order has been delivered",
      heading: "Your order has arrived",
      body: `${p(`Your order <strong>${esc(order.orderNumber)}</strong> has been delivered. We hope you enjoy it!`)}
${p("If anything arrived damaged, wrong or expired, please tell us within 48 hours with a photo and we'll make it right.")}
${button(orderUrl, "Review your order")}`,
    }),
  };
}

export function orderCancelledEmail(order: EmailOrder, reason: string, refundNote: string): Rendered {
  return {
    subject: `Order ${order.orderNumber} cancelled`,
    text: `Your order ${order.orderNumber} has been cancelled. ${reason} ${refundNote}`,
    html: layout({
      preheader: "Your order has been cancelled",
      heading: "Your order has been cancelled",
      body: `${p(`Order <strong>${esc(order.orderNumber)}</strong> has been cancelled.`)}${reason ? p(esc(reason)) : ""}${refundNote ? p(esc(refundNote)) : ""}`,
    }),
  };
}

export function refundEmail(order: EmailOrder, amountPaise: number, mode: "RAZORPAY" | "MANUAL"): Rendered {
  const note =
    mode === "RAZORPAY"
      ? "It will reach your original payment method, usually within 5–7 working days depending on your bank."
      : "We've sent it to you directly; you'll see it in your bank or UPI account shortly.";
  return {
    subject: `Refund of ${formatINR(amountPaise)} for order ${order.orderNumber}`,
    text: `We've issued a refund of ${formatINR(amountPaise)} for order ${order.orderNumber}. ${note}`,
    html: layout({
      preheader: "Your refund is on its way",
      heading: "Your refund has been issued",
      body: `${p(`We've issued a refund of <strong>${esc(formatINR(amountPaise))}</strong> for order <strong>${esc(order.orderNumber)}</strong>.`)}${p(esc(note))}`,
    }),
  };
}

export function latePaymentRefundEmail(order: EmailOrder): Rendered {
  return {
    subject: `About your payment for order ${order.orderNumber}`,
    text: `Your payment for order ${order.orderNumber} arrived after the payment window closed, and some items are no longer in stock. We've refunded it in full.`,
    html: layout({
      preheader: "Your payment has been refunded in full",
      heading: "We've refunded your payment",
      body: `${p(`Your payment for order <strong>${esc(order.orderNumber)}</strong> reached us after the payment window had closed, and some items sold out in the meantime.`)}
${p("We've refunded the full amount to your original payment method. It usually arrives within 5–7 working days. We're sorry for the trouble.")}`,
    }),
  };
}

export function adminNewOrderEmail(order: EmailOrder, adminUrl: string): Rendered {
  return {
    subject: `New order ${order.orderNumber} · ${formatINR(order.totalPaise)} (${order.paymentMethod === "COD" ? "COD" : "Prepaid"})`,
    text: `New order ${order.orderNumber} for ${formatINR(order.totalPaise)}. Open: ${adminUrl}`,
    html: layout({
      preheader: "A new order is ready to pack",
      heading: `New order ${order.orderNumber}`,
      body: `${itemsTable(order)}${button(adminUrl, "Open in admin")}`,
      footer: "Staff notification from The Farm Door admin.",
    }),
  };
}

export function lowStockEmail(items: { name: string; sku: string; available: number; unit: string; threshold: number }[], adminUrl: string): Rendered {
  const rows = items
    .map((i) => `<tr><td style="padding:6px 0;font-size:14px">${esc(i.name)} <span style="color:${C.muted}">(${esc(i.sku)})</span></td><td style="padding:6px 0;font-size:14px;text-align:right">${i.available} ${esc(i.unit)} left (alert at ${i.threshold})</td></tr>`)
    .join("");
  return {
    subject: `Low stock: ${items.length} item${items.length === 1 ? "" : "s"}`,
    text: items.map((i) => `${i.name} (${i.sku}): ${i.available} ${i.unit} left`).join("\n"),
    html: layout({
      preheader: "Some items are running low",
      heading: "Stock running low",
      body: `<table role="presentation" width="100%">${rows}</table>${button(adminUrl, "Open inventory")}`,
      footer: "Staff notification from The Farm Door admin.",
    }),
  };
}

export function dailySummaryEmail(s: { date: string; orders: number; netSalesPaise: number; toPack: number; codAwaitingConfirmation: number }, adminUrl: string): Rendered {
  return {
    subject: `Yesterday at The Farm Door: ${s.orders} order${s.orders === 1 ? "" : "s"}, ${formatINR(s.netSalesPaise)}`,
    text: `${s.date}: ${s.orders} orders, net sales ${formatINR(s.netSalesPaise)}. ${s.toPack} to pack, ${s.codAwaitingConfirmation} COD orders awaiting confirmation.`,
    html: layout({
      preheader: "Your daily summary",
      heading: `Summary for ${s.date}`,
      body: `${p(`Confirmed orders: <strong>${s.orders}</strong>`)}${p(`Net sales (after discounts and refunds, incl. GST): <strong>${esc(formatINR(s.netSalesPaise))}</strong>`)}
${p(`Waiting to be packed: <strong>${s.toPack}</strong>`)}${p(`COD orders awaiting customer confirmation: <strong>${s.codAwaitingConfirmation}</strong>`)}${button(adminUrl, "Open dashboard")}`,
      footer: "Staff notification from The Farm Door admin.",
    }),
  };
}
