import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { staffUsers } from "@/db/schema";
import { can } from "@/server/permissions";
import { changeRole, createStaff, setActive, StaffAdminError, temporaryPassword } from "@/server/staff-admin";
import { passwordProblem, verifyPassword } from "@/lib/crypto";
import { db, makeStaff, resetDb } from "./support/db";

describe("roles", () => {
  it("keeps money and settings away from packing staff and managers", () => {
    expect(can("PACKER", "orders.pack")).toBe(true);
    expect(can("PACKER", "orders.customerDetails")).toBe(false);
    expect(can("PACKER", "reports.finance")).toBe(false);
    expect(can("PACKER", "orders.refund")).toBe(false);
    expect(can("MANAGER", "orders.manage")).toBe(true);
    expect(can("MANAGER", "orders.refund")).toBe(false);
    expect(can("MANAGER", "reports.finance")).toBe(false);
    expect(can("MANAGER", "settings.manage")).toBe(false);
    expect(can("ACCOUNTANT", "reports.finance")).toBe(true);
    expect(can("ACCOUNTANT", "orders.manage")).toBe(false);
    expect(can("ACCOUNTANT", "products.manage")).toBe(false);
    expect(can("OWNER", "staff.manage")).toBe(true);
  });
});

describe("staff management", () => {
  beforeEach(resetDb);

  it("issues strong temporary passwords", async () => {
    for (let i = 0; i < 20; i++) expect(passwordProblem(temporaryPassword())).toBeNull();
    const owner = await makeStaff("OWNER");
    const { id, password } = await createStaff(db, { name: "New Packer", email: "Packer@Example.com", role: "PACKER" }, owner.id);
    const [row] = await db.select().from(staffUsers).where(eq(staffUsers.id, id));
    expect(row.email).toBe("packer@example.com");
    expect(await verifyPassword(password, row.passwordHash)).toBe(true);
    await expect(createStaff(db, { name: "Dup", email: "packer@example.com", role: "PACKER" }, owner.id)).rejects.toBeInstanceOf(StaffAdminError);
  });

  it("never leaves the store without an active owner", async () => {
    const owner = await makeStaff("OWNER");
    const other = await makeStaff("OWNER");
    await expect(changeRole(db, owner.id, "MANAGER", owner.id)).rejects.toThrow(/own role/);
    await expect(setActive(db, owner.id, false, owner.id)).rejects.toThrow(/your own/);
    await changeRole(db, other.id, "MANAGER", owner.id);
    // `other` is now a manager; the only remaining owner can't be demoted by anyone.
    const manager = other;
    await expect(changeRole(db, owner.id, "MANAGER", manager.id)).rejects.toThrow(/at least one owner/);
    await expect(setActive(db, owner.id, false, manager.id)).rejects.toThrow(/active owner/);
  });
});
