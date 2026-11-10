import { describe, expect, it } from "vitest";
import { staffSignedIn, type CurrentStaff } from "@/data/session";

const staff = (over: Partial<CurrentStaff>): CurrentStaff => ({ id: 1, email: "a@b.test", name: "A", role: "OWNER", totpEnabled: true, mfaPending: false, ...over });

describe("staff sign-in rules", () => {
  it("with 2-step verification required, needs the authenticator set up and its code entered", () => {
    expect(staffSignedIn(staff({}), true)).toBe(true);
    expect(staffSignedIn(staff({ mfaPending: true }), true)).toBe(false);
    expect(staffSignedIn(staff({ totpEnabled: false }), true)).toBe(false);
    expect(staffSignedIn(null, true)).toBe(false);
  });

  it("with STAFF_TWO_STEP=off, the password alone is enough, but a half-finished sign-in still isn't", () => {
    expect(staffSignedIn(staff({ totpEnabled: false }), false)).toBe(true);
    expect(staffSignedIn(staff({}), false)).toBe(true);
    expect(staffSignedIn(staff({ mfaPending: true }), false)).toBe(false);
    expect(staffSignedIn(null, false)).toBe(false);
  });
});
