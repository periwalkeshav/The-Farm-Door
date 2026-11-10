import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { staffRecoveryCodes } from "@/db/schema";
import { totpAt } from "@/lib/totp";
import { createRecoveryCodes, recoveryCodesLeft, redeemRecoveryCode } from "@/server/auth/recovery-codes";
import { beginTotpSetup, checkStaffTotp, getStaff } from "@/server/auth/staff";
import { staffUsers } from "@/db/schema";
import { resetTwoFactor } from "@/server/staff-admin";
import { db, makeStaff, resetDb } from "./support/db";

describe("staff backup codes", () => {
  beforeEach(resetDb);

  it("makes ten readable one-time codes and stores only hashes", async () => {
    const staff = await makeStaff();
    const codes = await createRecoveryCodes(db, staff.id);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const rows = await db.select().from(staffRecoveryCodes).where(eq(staffRecoveryCodes.staffUserId, staff.id));
    expect(rows.every((r) => r.codeHash.length === 64 && !codes.some((c) => r.codeHash.includes(c.replace("-", ""))))).toBe(true);
  });

  it("each code works once, in any case and with or without the dash", async () => {
    const staff = await makeStaff();
    const [first, second] = await createRecoveryCodes(db, staff.id);
    expect(await redeemRecoveryCode(db, staff.id, first.toLowerCase().replace("-", " "), "1.1.1.1")).toBe(9);
    expect(await redeemRecoveryCode(db, staff.id, first, "1.1.1.1")).toBeNull();
    expect(await redeemRecoveryCode(db, staff.id, "AAAA-AAAA", "1.1.1.1")).toBeNull();
    // Another staff member's code doesn't work for this account.
    const other = await makeStaff("MANAGER");
    expect(await redeemRecoveryCode(db, other.id, second, "1.1.1.1")).toBeNull();
    expect(await recoveryCodesLeft(db, staff.id)).toBe(9);
  });

  it("new codes cancel old ones, and a 2-step reset removes them", async () => {
    const staff = await makeStaff();
    const [old] = await createRecoveryCodes(db, staff.id);
    await createRecoveryCodes(db, staff.id);
    expect(await redeemRecoveryCode(db, staff.id, old, "1.1.1.1")).toBeNull();
    await resetTwoFactor(db, staff.id, null);
    expect(await recoveryCodesLeft(db, staff.id)).toBe(0);
  });
});

describe("staff authenticator codes", () => {
  beforeEach(resetDb);

  it("a code signs in once; it still works to confirm an action while signed in", async () => {
    const { id } = await makeStaff();
    const secret = await beginTotpSetup(db, id);
    await db.update(staffUsers).set({ totpEnabled: true }).where(eq(staffUsers.id, id));
    const staff = (await getStaff(db, id))!;
    const code = totpAt(secret, Date.now());
    expect(await checkStaffTotp(db, staff, code, "1.1.1.1", { signIn: true })).toBe(true);
    expect(await checkStaffTotp(db, staff, code, "1.1.1.1", { signIn: true })).toBe(false);
    expect(await checkStaffTotp(db, staff, code, "1.1.1.1")).toBe(true);
    expect(await checkStaffTotp(db, staff, "000000", "1.1.1.1")).toBe(false);
  });
});
