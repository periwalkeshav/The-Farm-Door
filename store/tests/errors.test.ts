import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { emailLog, errorEvents } from "@/db/schema";
import { isControlFlow, recordError } from "@/server/errors";
import { notificationSettingsSchema, writeSettings } from "@/server/settings";
import { db, resetDb } from "./support/db";

describe("site error alerts", () => {
  beforeEach(async () => {
    await resetDb();
    await writeSettings(db, "notifications", { ...notificationSettingsSchema.parse({}), ownerEmail: "owner@example.com" });
  });

  it("groups repeats, strips query strings and emails the owner once an hour", async () => {
    const first = await recordError(db, { source: "server", message: "TypeError: x is undefined (order 100231)", route: "render /orders/[number]", path: "/orders/100231?t=secret-token" });
    const again = await recordError(db, { source: "server", message: "TypeError: x is undefined (order 100999)", route: "render /orders/[number]", path: "/orders/100999?t=other" });
    expect(again.id).toBe(first.id);
    expect(first.alerted).toBe(true);
    expect(again.alerted).toBe(false);
    const [row] = await db.select().from(errorEvents).where(eq(errorEvents.id, first.id));
    expect(row).toMatchObject({ count: 2, path: "/orders/100999" });
    const alerts = await db.select().from(emailLog).where(eq(emailLog.template, "error-alert"));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].html).not.toContain("secret-token");
  });

  it("alerts again after an hour, and reopens errors marked fixed", async () => {
    const r = await recordError(db, { source: "browser", message: "Payment button crashed", path: "/checkout" });
    await db.update(errorEvents).set({ lastAlertedAt: new Date(Date.now() - 2 * 3600_000), resolvedAt: new Date() }).where(eq(errorEvents.id, r.id));
    expect((await recordError(db, { source: "browser", message: "Payment button crashed", path: "/checkout" })).alerted).toBe(true);
    const [row] = await db.select().from(errorEvents).where(eq(errorEvents.id, r.id));
    expect(row.resolvedAt).toBeNull();
  });

  it("ignores Next.js redirects and not-found signals", () => {
    expect(isControlFlow(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" }))).toBe(true);
    expect(isControlFlow(Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }))).toBe(true);
    expect(isControlFlow(new Error("Database is down"))).toBe(false);
  });
});
