import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hashPassword, passwordProblem, verifyPassword } from "./crypto";
import { base32Decode, base32Encode, totpAt, verifyTotp } from "./totp";

describe("passwords", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("Correct-Horse-9");
    expect(await verifyPassword("Correct-Horse-9", hash)).toBe(true);
    expect(await verifyPassword("correct-horse-9", hash)).toBe(false);
  });
  it("rejects weak passwords", () => {
    expect(passwordProblem("short")).not.toBeNull();
    expect(passwordProblem("alllowercaseletters")).not.toBeNull();
    expect(passwordProblem("Spice-Route-2026")).toBeNull();
  });
});

describe("encryption", () => {
  it("round-trips and detects tampering", () => {
    const key = Buffer.alloc(32, 1).toString("base64");
    const sealed = encrypt("JBSWY3DPEHPK3PXP", key);
    expect(decrypt(sealed, key)).toBe("JBSWY3DPEHPK3PXP");
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    expect(() => decrypt(tampered, key)).toThrow();
  });
});

describe("TOTP", () => {
  it("matches the RFC 6238 SHA-1 test vector", () => {
    // RFC 6238 Appendix B: secret "12345678901234567890", T=59s -> 94287082 (8 digits)
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(totpAt(secret, 59_000, 30, 8)).toBe("94287082");
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });
  it("accepts small clock drift but not old codes", () => {
    const secret = base32Encode(Buffer.from("abcdefghijabcdefghij"));
    const now = 1_800_000_000_000;
    expect(verifyTotp(secret, totpAt(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, now - 120_000), now)).toBe(false);
  });
});
