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

const C = { ivory: "#F7F2E8", paper: "#FFFDF8", forest: "#1F3B2D", ink: "#27231F", muted: "#6A6158", line: "#DDD3C1", saffron: "#965818" };

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

export function orderShippedEmail(order: EmailOrder, info: { courier: string; awb: string; trackingUrl: string; orderUrl: string; invoiceAttached?: boolean }): Rendered {
  return {
    subject: `Your order ${order.orderNumber} has shipped`,
    text: `Your order ${order.orderNumber} is on its way with ${info.courier}${info.awb ? ` (AWB ${info.awb})` : ""}. Track it: ${info.trackingUrl || info.orderUrl}${info.invoiceAttached ? "\nYour tax invoice is attached as a PDF." : ""}`,
    html: layout({
      preheader: `On its way with ${info.courier}`,
      heading: "Your order is on its way",
      body: `${p(`Good news! Order <strong>${esc(order.orderNumber)}</strong> has shipped with <strong>${esc(info.courier)}</strong>.`)}
${info.awb ? p(`Tracking number (AWB): <strong>${esc(info.awb)}</strong>`) : ""}
${button(info.trackingUrl || info.orderUrl, "Track your parcel")}
${info.invoiceAttached ? p("Your tax invoice is attached as a PDF.") : ""}`,
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

export function refundEmail(order: EmailOrder, amountPaise: number, mode: "RAZORPAY" | "MANUAL", creditNoteAttached = false): Rendered {
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
      body: `${p(`We've issued a refund of <strong>${esc(formatINR(amountPaise))}</strong> for order <strong>${esc(order.orderNumber)}</strong>.`)}${p(esc(note))}${creditNoteAttached ? p("The credit note for this refund is attached as a PDF.") : ""}`,
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

export function unpaidReminderEmail(order: EmailOrder, orderUrl: string, unsubscribeUrl: string): Rendered {
  const names = order.items.map((i) => i.productName);
  const list = names.length > 2 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : names.join(" and ");
  return {
    subject: "You left something at The Farm Door",
    text: `Your order ${order.orderNumber} (${list}) wasn't paid, so it was cancelled and nothing was charged. To get the same items, open ${orderUrl} and choose "Add these items to my cart". Don't want reminders? ${unsubscribeUrl}`,
    html: layout({
      preheader: "Your order wasn't paid. Your items are one click away.",
      heading: "Still want your spices?",
      body: `${p(`Your order <strong>${esc(order.orderNumber)}</strong> wasn't paid, so it was cancelled and nothing was charged.`)}
${itemsTable(order)}
${p("If you'd still like them, open your order and add the same items to your cart in one click. Prices and stock are checked again when you do.")}
${button(orderUrl, "Return to my order")}`,
      footer: `You're receiving this one-time reminder because you started an order at thefarmdoor.com. <a href="${esc(unsubscribeUrl)}" style="color:${C.muted}">Don't send me reminders or offers</a>.`,
    }),
  };
}

export function reviewRequestEmail(name: string, productNames: string[], reviewUrl: string, unsubscribeUrl: string): Rendered {
  const first = name.split(" ")[0] || "there";
  const list = productNames.map((n) => `<li style="margin:4px 0">${esc(n)}</li>`).join("");
  return {
    subject: "How are your spices?",
    text: `Hi ${first}, we hope you're enjoying ${productNames.join(", ")}. Tell other cooks what you think: ${reviewUrl}. Don't want these emails? ${unsubscribeUrl}`,
    html: layout({
      preheader: "A quick review helps other cooks choose",
      heading: "How are your spices?",
      body: `${p(`Hi ${esc(first)}, we hope you're enjoying your order. If you have a minute, tell other cooks what you think of:`)}
<ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6">${list}</ul>
${p("Honest reviews, good or bad, help us and other customers. It takes about a minute.")}
${button(reviewUrl, "Write a review")}`,
      footer: `You're receiving this because you ordered from thefarmdoor.com. <a href="${esc(unsubscribeUrl)}" style="color:${C.muted}">Don't send me reminders or offers</a>.`,
    }),
  };
}

export function refillReminderEmail(name: string, items: { productName: string; variantTitle: string }[], orderUrl: string, stopUrl: string, weeks: string): Rendered {
  const first = name.split(" ")[0] || "there";
  const list = items.map((i) => `<li style="margin:4px 0">${esc(i.productName)}${i.variantTitle ? ` <span style="color:${C.muted}">(${esc(i.variantTitle)})</span>` : ""}</li>`).join("");
  return {
    subject: "Time to restock your spices?",
    text: `Hi ${first}, it's been ${weeks} since your reminder was set. Reorder the same items: ${orderUrl}. Stop these reminders: ${stopUrl}`,
    html: layout({
      preheader: "Your reorder reminder",
      heading: "Time to restock?",
      body: `${p(`Hi ${esc(first)}, you asked us to remind you every ${esc(weeks)}. Running low on any of these?`)}
<ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6">${list}</ul>
${p("Open your order and press “Buy again” to put the same items in your cart. Prices and stock are checked when you do.")}
${button(orderUrl, "Reorder")}`,
      footer: `You set up this reminder at thefarmdoor.com. <a href="${esc(stopUrl)}" style="color:${C.muted}">Stop these reminders</a>.`,
    }),
  };
}

export function backInStockEmail(productName: string, variantTitle: string, productUrl: string): Rendered {
  const what = variantTitle ? `${productName} (${variantTitle})` : productName;
  return {
    subject: `${productName} is back in stock`,
    text: `Good news: ${what} is back in stock at The Farm Door. ${productUrl}`,
    html: layout({
      preheader: "The pack you asked about is available again",
      heading: "It's back in stock",
      body: `${p(`Good news: <strong>${esc(what)}</strong> is available again.`)}${p("Stock can run out quickly, so we can't hold it for you.")}${button(productUrl, "Shop now")}`,
      footer: "You asked us to tell you when this was back. This is the only email we'll send about it.",
    }),
  };
}

export function enquiryAckEmail(name: string): Rendered {
  return {
    subject: "We've received your enquiry",
    text: `Hi ${name}, thanks for your bulk / business enquiry. We'll get back to you with prices and availability as soon as we can.`,
    html: layout({
      preheader: "We'll reply with prices and availability",
      heading: "Thanks for your enquiry",
      body: `${p(`Hi ${esc(name)}, thanks for getting in touch about a bulk or business order.`)}${p("We'll get back to you with prices and availability as soon as we can. If anything changes in the meantime, just reply to this email.")}`,
      footer: "You're receiving this because you sent an enquiry at thefarmdoor.com.",
    }),
  };
}

export function enquiryOwnerEmail(
  e: { name: string; businessName: string; gstin: string; email: string; phone: string; city: string; requirement: string },
  adminUrl: string,
): Rendered {
  const rows = [
    ["Name", e.name],
    ["Business", e.businessName],
    ["GSTIN", e.gstin],
    ["Email", e.email],
    ["Phone", e.phone],
    ["City", e.city],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:${C.muted};font-size:14px">${k}</td><td style="padding:4px 0;font-size:14px">${esc(v)}</td></tr>`)
    .join("");
  return {
    subject: `Bulk enquiry from ${e.businessName || e.name}`,
    text: `New bulk enquiry from ${e.name}${e.businessName ? ` (${e.businessName})` : ""}, ${e.phone}, ${e.email}.\n\n${e.requirement}\n\nOpen: ${adminUrl}`,
    html: layout({
      preheader: "A business customer is asking for a quote",
      heading: "New bulk enquiry",
      body: `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:14px">${rows}</table>${p(esc(e.requirement).replace(/\n/g, "<br>"))}${button(adminUrl, "Open enquiries")}`,
      footer: "Staff notification from The Farm Door admin.",
    }),
  };
}

export function errorAlertEmail(e: { source: string; message: string; route: string; path: string; count: number; digest: string }, adminUrl: string): Rendered {
  return {
    subject: `Site error: ${e.message.slice(0, 80)}`,
    text: `An error happened on the ${e.source === "browser" ? "customer's browser" : "server"} at ${e.path || e.route} (seen ${e.count} time${e.count === 1 ? "" : "s"}): ${e.message}. Details: ${adminUrl}`,
    html: layout({
      preheader: "Something went wrong on the website",
      heading: "Something went wrong on the website",
      body: `${p(`<strong>${esc(e.message)}</strong>`)}
${p(`Where: ${esc(e.path || "—")} ${e.route ? `(${esc(e.route)})` : ""}<br>Seen: ${e.count} time${e.count === 1 ? "" : "s"} · ${e.source === "browser" ? "in a customer's browser" : "on the server"}${e.digest ? `<br>Reference: ${esc(e.digest)}` : ""}`)}
${p("You'll get at most one email an hour about this error. If it keeps happening, forward this email to whoever maintains the site.")}
${button(adminUrl, "See all site errors")}`,
      footer: "Staff notification from The Farm Door admin.",
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

/* ---------------- Problems with delivered orders ---------------- */

export function problemReceivedEmail(name: string, orderNumber: string, kindLabel: string, orderUrl: string): Rendered {
  return {
    subject: `We've received your report about order ${orderNumber}`,
    text: `Hi ${name}, thanks for telling us about a problem with order ${orderNumber} (${kindLabel}). We're sorry about this. We'll look at your photos and get back to you by email about a replacement or refund. Your order: ${orderUrl}`,
    html: layout({
      preheader: "We'll get back to you about a replacement or refund",
      heading: "Sorry about that",
      body: `${p(`Hi ${esc(name)}, thanks for telling us about a problem with order <strong>${esc(orderNumber)}</strong> (${esc(kindLabel.toLowerCase())}).`)}${p("We'll look at your photos and get back to you by email about a replacement or a refund. If you have anything to add, just reply to this email.")}${button(orderUrl, "View your order")}`,
    }),
  };
}

export function problemOwnerEmail(
  r: { orderNumber: string; name: string; email: string; phone: string; kindLabel: string; description: string; items: string[]; photos: number },
  adminUrl: string,
): Rendered {
  return {
    subject: `Problem reported on order ${r.orderNumber}: ${r.kindLabel}`,
    text: `${r.name} (${r.phone}, ${r.email}) reported a problem with order ${r.orderNumber}: ${r.kindLabel}.\nItems: ${r.items.join(", ")}\n\n${r.description}\n\n${r.photos} photo(s). Open: ${adminUrl}`,
    html: layout({
      preheader: "A customer needs a replacement or refund",
      heading: `Problem with order ${r.orderNumber}`,
      body: `${p(`<strong>${esc(r.kindLabel)}</strong> · ${esc(r.name)} · ${esc(r.phone)} · ${esc(r.email)}`)}${p(`Items: ${esc(r.items.join(", "))}`)}${p(esc(r.description).replace(/\n/g, "<br>"))}${p(`${r.photos} photo${r.photos === 1 ? "" : "s"} attached in the admin panel.`)}${button(adminUrl, "Open problem reports")}`,
      footer: "Staff notification from The Farm Door admin.",
    }),
  };
}

export function replacementSentEmail(order: EmailOrder, originalOrderNumber: string, note: string, orderUrl: string): Rendered {
  const items = order.items.map((i) => `${i.productName} (${i.variantTitle}) × ${i.quantity}`);
  return {
    subject: `We're sending you a replacement (order ${order.orderNumber})`,
    text: `Hi ${order.shipName}, we're sending a free replacement for order ${originalOrderNumber}: ${items.join(", ")}.\n${note}\nThere's nothing to pay. We'll email you when it ships. Replacement order: ${orderUrl}`,
    html: layout({
      preheader: "There's nothing to pay",
      heading: "Your replacement is on its way",
      body: `${p(`Hi ${esc(order.shipName)}, we're sending a free replacement for order <strong>${esc(originalOrderNumber)}</strong>:`)}${p(items.map(esc).join("<br>"))}${note ? p(esc(note).replace(/\n/g, "<br>")) : ""}${p("There's nothing to pay. We'll email you again when it ships.")}${button(orderUrl, "View replacement order")}`,
    }),
  };
}

export function problemClosedEmail(name: string, orderNumber: string, note: string, orderUrl: string): Rendered {
  return {
    subject: `About your report on order ${orderNumber}`,
    text: `Hi ${name}, about the problem you reported with order ${orderNumber}:\n\n${note}\n\nIf you have questions, just reply to this email. Your order: ${orderUrl}`,
    html: layout({
      preheader: "An update on the problem you reported",
      heading: "About the problem you reported",
      body: `${p(`Hi ${esc(name)}, about the problem you reported with order <strong>${esc(orderNumber)}</strong>:`)}${p(esc(note).replace(/\n/g, "<br>"))}${p("If you have questions, just reply to this email.")}${button(orderUrl, "View your order")}`,
    }),
  };
}

export function backupCodeUsedEmail(name: string, remaining: number, accountUrl: string): Rendered {
  return {
    subject: "A backup code was used to sign in to The Farm Door admin",
    text: `Hi ${name}, someone signed in to your admin account with a backup code instead of your authenticator app. ${remaining} backup code${remaining === 1 ? "" : "s"} left. If this wasn't you, change your password now and ask the owner to reset your 2-step verification. ${accountUrl}`,
    html: layout({
      preheader: "If this wasn't you, change your password now",
      heading: "A backup code was used",
      body: `${p(`Hi ${esc(name)}, someone signed in to your admin account with a backup code instead of your authenticator app.`)}${p(`You have <strong>${remaining}</strong> backup code${remaining === 1 ? "" : "s"} left. If you've lost your phone, set up the authenticator again and make new backup codes from My account.`)}${p("<strong>If this wasn't you</strong>, change your password now and ask the owner to reset your 2-step verification.")}${button(accountUrl, "Open My account")}`,
      footer: "Security notice from The Farm Door admin.",
    }),
  };
}
