import { describe, expect, it } from "vitest";
import { changePasswordSchema, checkoutSchema, couponFormSchema, storeSettingsFormSchema, trackSchema } from "./form-schemas";
import { fieldErrorsFrom } from "./validation";

const errorsOf = (r: { success: boolean; error?: unknown }) => (r.success ? {} : fieldErrorsFrom(r.error as never));

const address = { email: "Asha@Example.com ", phone: "+91 98765-43210", name: "Asha Rao", line1: "12 MG Road", line2: "", landmark: "", city: "Jaipur", state: "Rajasthan", pincode: "302001", gstin: "", businessName: "", note: "" };

describe("checkout rules", () => {
  it("accepts and normalises a good address", () => {
    const r = checkoutSchema.safeParse(address);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ email: "asha@example.com", phone: "9876543210" });
  });

  it("explains each problem next to its field", () => {
    const e = errorsOf(checkoutSchema.safeParse({ ...address, email: "asha@", phone: "12345", name: "R2D2", line1: "12", city: "302", state: "", pincode: "012345" }));
    expect(Object.keys(e).sort()).toEqual(["city", "email", "line1", "name", "phone", "pincode", "state"]);
    expect(e.name).toBe("Names can't contain numbers.");
    expect(e.state).toBe("Choose a state.");
  });

  it("asks for an empty required field rather than a format", () => {
    expect(errorsOf(checkoutSchema.safeParse({ ...address, email: "" })).email).toBe("Enter your email address.");
    expect(errorsOf(checkoutSchema.safeParse({ ...address, pincode: "" })).pincode).toBe("Enter the 6-digit pincode.");
  });

  it("needs a business name with a GSTIN, and the other way round", () => {
    expect(errorsOf(checkoutSchema.safeParse({ ...address, gstin: "08AAACT2727Q1ZV" })).businessName).toMatch(/business name/);
    expect(errorsOf(checkoutSchema.safeParse({ ...address, businessName: "Asha Foods" })).gstin).toMatch(/GSTIN/);
  });
});

describe("store settings rules", () => {
  const base = { tradeName: "The Farm Door", legalName: "", cin: "", gstin: "", fssaiNumber: "", addressLine1: "", addressLine2: "", city: "Jaipur", state: "Rajasthan", pincode: "", supportEmail: "", supportPhone: "", supportHours: "", whatsappNumber: "", instagramUrl: "", facebookUrl: "", youtubeUrl: "" };

  it("accepts the defaults", () => {
    expect(storeSettingsFormSchema.safeParse(base).success).toBe(true);
  });

  it("catches a GSTIN from another state, bad FSSAI/CIN and links", () => {
    const e = errorsOf(storeSettingsFormSchema.safeParse({ ...base, legalName: "X Pvt Ltd", gstin: "27AAACT2727Q1ZS", fssaiNumber: "1234", cin: "ABC", instagramUrl: "instagram.com/x", supportPhone: "call me" }));
    expect(e.gstin ?? "").toMatch(/Maharashtra|valid/);
    expect(e.fssaiNumber).toMatch(/14 digits/);
    expect(e.cin).toMatch(/21 characters/);
    expect(e.instagramUrl).toMatch(/https/);
    expect(e.supportPhone).toBeTruthy();
  });
});

describe("other forms", () => {
  it("track: order number and email-or-mobile", () => {
    expect(trackSchema.safeParse({ orderNumber: "#100001", contact: "98765 43210" }).success).toBe(true);
    expect(Object.keys(errorsOf(trackSchema.safeParse({ orderNumber: "12", contact: "nope" }))).sort()).toEqual(["contact", "orderNumber"]);
  });

  it("password change: strength, match and difference", () => {
    const e = errorsOf(changePasswordSchema.safeParse({ current: "Old-Password-1", next: "short", confirm: "other" }));
    expect(e.next).toMatch(/12 characters/);
    expect(e.confirm).toMatch(/match/);
    expect(errorsOf(changePasswordSchema.safeParse({ current: "Spice-Route-2026", next: "Spice-Route-2026", confirm: "Spice-Route-2026" })).next).toMatch(/different/);
  });

  it("coupon: value by type, scope and dates", () => {
    const base = { code: "spice10", description: "", type: "PERCENT", value: "", maxDiscount: "", minOrder: "", scope: "PRODUCTS", startsOn: "2026-11-10", endsOn: "2026-11-01", usageLimitTotal: "5", usageLimitPerCustomer: "6", isActive: "on" };
    const e = errorsOf(couponFormSchema.safeParse(base));
    expect(Object.keys(e).sort()).toEqual(["endsOn", "productIds", "usageLimitPerCustomer", "value"]);
    const ok = couponFormSchema.safeParse({ ...base, value: "10", scope: "ALL", endsOn: "", usageLimitPerCustomer: "1" });
    expect(ok.success && ok.data.code).toBe("SPICE10");
  });
});
