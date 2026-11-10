import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailLog, orders } from "@/db/schema";
import { resetEnvForTests } from "@/lib/env";
import { writeSettings } from "@/server/settings";
import { notifyWhatsApp, toWhatsAppNumber } from "@/server/whatsapp";
import { db, resetDb } from "./support/db";
import { placedOrder } from "./support/orders";

function useEnv(vars: Record<string, string>) {
  Object.assign(process.env, vars);
  resetEnvForTests();
}

async function optedInOrder(optIn = true) {
  const placed = await placedOrder("PREPAID", "wa@example.com");
  const [o] = await db.update(orders).set({ whatsappOptIn: optIn }).where(eq(orders.id, placed.order.id)).returning();
  return o;
}

const waLog = () => db.select().from(emailLog).where(eq(emailLog.template, "whatsapp-order_confirmed"));

describe("WhatsApp order updates", () => {
  beforeEach(resetDb);
  afterEach(() => {
    useEnv({ WHATSAPP_TRANSPORT: "off", WHATSAPP_TOKEN: "", WHATSAPP_PHONE_NUMBER_ID: "" });
    vi.unstubAllGlobals();
  });

  it("formats Indian mobile numbers for WhatsApp", () => {
    expect(toWhatsAppNumber("98765 43210")).toBe("919876543210");
    expect(toWhatsAppNumber("+91-98765-43210")).toBe("919876543210");
    expect(toWhatsAppNumber("12345")).toBeNull();
  });

  it("only messages customers who opted in, and only when it's switched on", async () => {
    useEnv({ WHATSAPP_TRANSPORT: "log" });
    const order = await optedInOrder();
    await notifyWhatsApp(db, order, "order_confirmed", { link: "https://x" });
    expect(await waLog()).toHaveLength(0); // owner hasn't switched it on

    await writeSettings(db, "whatsapp", { enabled: true });
    await notifyWhatsApp(db, await optedInOrder(false), "order_confirmed", { link: "https://x" });
    expect(await waLog()).toHaveLength(0); // customer didn't opt in

    await notifyWhatsApp(db, order, "order_confirmed", { link: "https://x" });
    const [entry] = await waLog();
    expect(entry).toMatchObject({ to: "whatsapp:919876543210", status: "LOGGED" });
  });

  it("sends an approved template through the Cloud API and logs failures without throwing", async () => {
    useEnv({ WHATSAPP_TRANSPORT: "cloud", WHATSAPP_TOKEN: "tok", WHATSAPP_PHONE_NUMBER_ID: "12345" });
    await writeSettings(db, "whatsapp", { enabled: true });
    const order = await optedInOrder();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Template not approved" } }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await notifyWhatsApp(db, order, "order_confirmed", { link: "https://thefarmdoor.com/orders/1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v22.0/12345/messages");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: "919876543210", type: "template", template: { name: "order_confirmed", language: { code: "en" } } });
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(["Kiran", order.orderNumber, "₹279", "https://thefarmdoor.com/orders/1"]);

    await notifyWhatsApp(db, order, "order_confirmed", { link: "x" });
    const statuses = (await waLog()).map((e) => [e.status, e.subject]);
    expect(statuses).toEqual([
      ["SENT", "WhatsApp · order_confirmed"],
      ["FAILED", "WhatsApp · order_confirmed · Template not approved"],
    ]);
  });
});
