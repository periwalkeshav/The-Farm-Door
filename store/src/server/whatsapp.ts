/**
 * WhatsApp order updates through Meta's WhatsApp Cloud API (no middleman).
 *
 * Off until: Meta has approved the business and the message templates below,
 * the server has WHATSAPP_TRANSPORT=cloud with the token and phone number id,
 * and the owner switches it on in Admin > Settings. Messages only go to
 * customers who ticked "Send me order updates on WhatsApp" at checkout.
 * Every message is logged in Admin > Email log; a failure never blocks an order.
 */
import type { DbOrTx } from "@/db";
import { emailLog } from "@/db/schema";
import { env } from "@/lib/env";
import { formatINR } from "@/lib/money";
import type { OrderRow } from "./orders/common";
import { readSettings } from "./settings";

/**
 * Templates to create in WhatsApp Manager (category: Utility), with these names
 * and the variables in this order. Text can be reworded; keep the variables.
 */
export const WHATSAPP_TEMPLATES = {
  order_confirmed: { variables: ["customer name", "order number", "total", "order link"], example: "Hi {{1}}, your The Farm Door order {{2}} ({{3}}) is confirmed. We'll message you when it ships. Details: {{4}}" },
  cod_confirm: { variables: ["customer name", "order number", "total", "confirm link"], example: "Hi {{1}}, please confirm your cash-on-delivery order {{2}} ({{3}}) so we can pack it: {{4}}" },
  order_shipped: { variables: ["customer name", "order number", "courier", "tracking link"], example: "Hi {{1}}, your order {{2}} is on its way with {{3}}. Track it here: {{4}}" },
  order_delivered: { variables: ["customer name", "order number"], example: "Hi {{1}}, your order {{2}} has been delivered. Enjoy your spices!" },
} as const;
export type WhatsAppTemplate = keyof typeof WHATSAPP_TEMPLATES;

/** WhatsApp numbers are sent as digits with the country code, e.g. 919876543210. */
export function toWhatsAppNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return null;
}

/** True when the store can actually send (credentials present and switched on). */
export async function whatsappActive(db: DbOrTx) {
  const e = env();
  if (e.WHATSAPP_TRANSPORT === "off") return false;
  if (e.WHATSAPP_TRANSPORT === "cloud" && (!e.WHATSAPP_TOKEN || !e.WHATSAPP_PHONE_NUMBER_ID)) return false;
  return (await readSettings(db, "whatsapp")).enabled;
}

async function send(db: DbOrTx, order: Pick<OrderRow, "id" | "phone" | "shipPhone">, template: WhatsAppTemplate, variables: string[]) {
  const e = env();
  const to = toWhatsAppNumber(order.phone || order.shipPhone);
  const log = (status: "SENT" | "FAILED" | "LOGGED", detail = "") =>
    db.insert(emailLog).values({ to: `whatsapp:${to ?? order.phone}`, subject: `WhatsApp · ${template}${detail ? ` · ${detail}` : ""}`.slice(0, 300), template: `whatsapp-${template}`, status, html: variables.map((v, i) => `{{${i + 1}}} ${v}`).join("<br>"), orderId: order.id });
  if (!to) return log("FAILED", "not a valid Indian mobile number");
  if (e.WHATSAPP_TRANSPORT === "log") return log("LOGGED");
  try {
    const res = await fetch(`https://graph.facebook.com/${e.WHATSAPP_GRAPH_VERSION}/${encodeURIComponent(e.WHATSAPP_PHONE_NUMBER_ID)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${e.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name: template, language: { code: e.WHATSAPP_TEMPLATE_LANG }, components: [{ type: "body", parameters: variables.map((text) => ({ type: "text", text: text.slice(0, 1000) })) }] },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return log("SENT");
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return log("FAILED", body?.error?.message ?? `HTTP ${res.status}`);
  } catch (err) {
    return log("FAILED", err instanceof Error ? err.message : "network error");
  }
}

/** Sends an order update if the customer opted in and WhatsApp is on. Never throws. */
export async function notifyWhatsApp(db: DbOrTx, order: OrderRow, template: WhatsAppTemplate, extra: { link?: string; courier?: string } = {}) {
  try {
    if (!order.whatsappOptIn || !(await whatsappActive(db))) return;
    const name = order.shipName.split(" ")[0] || "there";
    const vars: Record<WhatsAppTemplate, string[]> = {
      order_confirmed: [name, order.orderNumber, formatINR(order.totalPaise), extra.link ?? ""],
      cod_confirm: [name, order.orderNumber, formatINR(order.totalPaise), extra.link ?? ""],
      order_shipped: [name, order.orderNumber, extra.courier ?? "our courier", extra.link ?? ""],
      order_delivered: [name, order.orderNumber],
    };
    await send(db, order, template, vars[template]);
  } catch (err) {
    console.error(`[whatsapp] couldn't send ${template} for order ${order.orderNumber}:`, err);
  }
}
