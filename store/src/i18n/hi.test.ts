import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { INDIAN_STATES } from "@/lib/india";
import { POINT_REASONS } from "@/server/loyalty";
import { PAYMENT_STATUS_FOR_CUSTOMER, PAYMENT_STATUS_LABELS, STATUS_LABELS } from "@/server/orders/common";
import { PROBLEM_KIND_LABELS, PROBLEM_STATUS_FOR_CUSTOMER } from "@/server/problems";
import { sourceKeys } from "../../scripts/i18n-keys";
import { HI } from "./hi";
import { translate, translateParts } from "./translate";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const hindi = (s: string) => /[ऀ-ॿ]/.test(s);

/** Sort options in the shop listing (read from the file: it's a Server Component, which tests can't import). */
function sortLabels() {
  const listing = readFileSync(path.join(process.cwd(), "src/components/shop/listing.tsx"), "utf8");
  const block = listing.slice(listing.indexOf("export const SORTS"), listing.indexOf("];", listing.indexOf("export const SORTS")));
  return [...block.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
}

/** Messages server actions send back to shoppers (`message: "…"` and `reason: "…"`). */
function serverMessages() {
  const files = ["account", "auth", "cart", "checkout", "enquiry", "newsletter", "orders", "wishlist"].map((f) => `src/actions/${f}.ts`);
  files.push("src/server/cart.ts", "src/server/coupons.ts", "src/server/checkout.ts", "src/server/orders/place.ts", "src/server/auth/customer.ts", "src/lib/pricing.ts");
  const found = new Set<string>();
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(path.join(process.cwd(), file), "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && ["message", "reason"].includes(node.name.text) && ts.isStringLiteral(node.initializer)) found.add(node.initializer.text);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...found];
}

describe("Hindi translations", () => {
  it("cover every phrase the shop pages translate", () => {
    const missing = [...sourceKeys()].filter(([text]) => !(text in HI)).map(([text, where]) => `${where}: ${text}`);
    expect(missing).toEqual([]);
  });

  it("cover the messages the server sends to shoppers", () => {
    expect(serverMessages().filter((m) => translate("hi", m) === m)).toEqual([]);
  });

  it("cover order statuses, points, problem reports, sort options, test-mode notes and states", () => {
    const labels = [
      ...Object.values(STATUS_LABELS),
      ...Object.values(PAYMENT_STATUS_LABELS),
      ...Object.values(PAYMENT_STATUS_FOR_CUSTOMER).filter(Boolean),
      ...Object.values(POINT_REASONS),
      ...Object.values(PROBLEM_KIND_LABELS),
      ...Object.values(PROBLEM_STATUS_FOR_CUSTOMER),
      ...sortLabels(),
      ...[...readFileSync(path.join(process.cwd(), "src/lib/env.ts"), "utf8").matchAll(/reasons\.push\("([^"]+)"\)/g)].map((m) => m[1]),
      ...INDIAN_STATES.map((s) => s.name),
    ];
    expect(sortLabels()).toHaveLength(5);
    expect(labels.filter((l) => !(l in HI))).toEqual([]);
  });

  it("keep every {placeholder} of the English", () => {
    const wrong = Object.entries(HI).filter(([en, hi]) => placeholders(en).join() !== placeholders(hi).join());
    expect(wrong).toEqual([]);
  });

  it("are written in Hindi (apart from names and codes that stay as they are)", () => {
    const same = new Set(["MRP", "GSTIN", "out of 5"]);
    expect(Object.entries(HI).filter(([en, hi]) => !same.has(en) && !hindi(hi))).toEqual([]);
  });

  it("translate messages with numbers and names in them", () => {
    expect(translate("hi", "Only 3 left. Please reduce the quantity.")).toBe("सिर्फ़ 3 बचे हैं। कृपया मात्रा घटाएँ।");
    expect(translate("hi", "2 items added to your cart")).toBe("2 आइटम कार्ट में जोड़े गए");
    expect(translate("hi", "The address must be 200 characters or fewer.")).toBe("पता 200 अक्षरों या उससे कम का होना चाहिए।");
    expect(translate("hi", "Pincode 302001 is in Rajasthan. Choose Rajasthan, or check the pincode.")).toBe("पिनकोड 302001 राजस्थान में है। राजस्थान चुनें, या पिनकोड जाँचें।");
    expect(translate("hi", "You reported a problem: damaged or leaking. We'll email you about a replacement or refund.")).toContain("टूटा या लीक");
    expect(translate("hi", "Best before 12 months from packing (sample text, confirm for your products)")).toBe("पैकिंग से 12 महीने तक इस्तेमाल करें (नमूना टेक्स्ट, अपने प्रोडक्ट के लिए पक्का करें)");
  });

  it("fall back to English for anything without a translation, and fill in values", () => {
    expect(translate("hi", "Some new sentence.")).toBe("Some new sentence.");
    expect(translate("en", "Order {number}", { number: "100001" })).toBe("Order 100001");
    expect(translate("hi", "Order {number}", { number: "100001" })).toBe("ऑर्डर 100001");
    expect(translateParts("hi", "Powder · 250 g")).toBe("पिसा हुआ · 250 g");
  });
});
