import { describe, expect, it } from "vitest";
import { financialYear, financialYearShort, isValidGstin, isValidPincode, normalizeIndianMobile } from "./india";

describe("india helpers", () => {
  it("validates pincodes by format", () => {
    expect(isValidPincode("302001")).toBe(true);
    expect(isValidPincode("002001")).toBe(false);
    expect(isValidPincode("30200")).toBe(false);
  });
  it("normalises mobile numbers", () => {
    expect(normalizeIndianMobile("+91 98290 12345")).toBe("9829012345");
    expect(normalizeIndianMobile("09829012345")).toBe("9829012345");
    expect(normalizeIndianMobile("5829012345")).toBeNull();
  });
  it("checks the GSTIN check digit", () => {
    // Publicly documented sample GSTIN with a valid check digit.
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZX")).toBe(false);
    expect(isValidGstin("not-a-gstin")).toBe(false);
  });
  it("works out the Indian financial year in IST", () => {
    expect(financialYear(new Date("2026-03-31T18:30:00Z"))).toBe("2026-27"); // 1 Apr 2026, 00:00 IST
    expect(financialYear(new Date("2026-03-31T18:29:00Z"))).toBe("2025-26"); // 31 Mar 2026, 23:59 IST
    expect(financialYearShort(new Date("2026-10-16T00:00:00Z"))).toBe("26-27");
  });
});
