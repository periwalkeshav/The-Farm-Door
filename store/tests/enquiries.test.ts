import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { emailLog, enquiries } from "@/db/schema";
import { createEnquiry, enquiryInputSchema, updateEnquiry } from "@/server/enquiries";
import { can } from "@/server/permissions";
import { notificationSettingsSchema, writeSettings } from "@/server/settings";
import { db, makeStaff, resetDb } from "./support/db";

const valid = { name: "Asha Hotels", businessName: "Asha Hotels Pvt Ltd", gstin: "", email: "Buyer@Example.com", phone: "+91 98765 43210", city: "Jaipur", requirement: "Turmeric powder 10 kg every month" };

describe("bulk enquiries", () => {
  beforeEach(resetDb);

  it("validates and normalises the form", () => {
    const ok = enquiryInputSchema.parse(valid);
    expect(ok).toMatchObject({ email: "buyer@example.com", phone: "9876543210" });
    const bad = enquiryInputSchema.safeParse({ ...valid, gstin: "08ABCDE1234F1Z9", phone: "12345", requirement: "spice" });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues.map((i) => i.path[0]).sort()).toEqual(["gstin", "phone", "requirement"]);
  });

  it("stores the enquiry, alerts the owner and acknowledges the customer", async () => {
    await writeSettings(db, "notifications", { ...notificationSettingsSchema.parse({}), ownerEmail: "owner@example.com" });
    const row = await createEnquiry(db, enquiryInputSchema.parse(valid));
    expect(row.status).toBe("NEW");
    const sent = await db.select({ to: emailLog.to, template: emailLog.template }).from(emailLog);
    expect(sent).toEqual(expect.arrayContaining([{ to: "owner@example.com", template: "enquiry-owner" }, { to: "buyer@example.com", template: "enquiry-ack" }]));

    const staff = await makeStaff("MANAGER");
    expect(await updateEnquiry(db, row.id, { status: "CONTACTED", staffNote: "Called" }, staff.id)).toBe(true);
    const [after] = await db.select().from(enquiries).where(eq(enquiries.id, row.id));
    expect(after).toMatchObject({ status: "CONTACTED", staffNote: "Called" });
  });

  it("is visible to owners and managers only", () => {
    expect(can("OWNER", "enquiries.manage")).toBe(true);
    expect(can("MANAGER", "enquiries.manage")).toBe(true);
    expect(can("PACKER", "enquiries.manage")).toBe(false);
    expect(can("ACCOUNTANT", "enquiries.manage")).toBe(false);
  });
});
