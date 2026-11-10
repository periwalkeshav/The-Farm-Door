import { expect, test } from "@playwright/test";
import { addAProductToCart, fillCheckout, JAIPUR, openCheckout, uniqueEmail } from "./helpers";

test("buys on a phone-sized screen", async ({ page }) => {
  await addAProductToCart(page);
  await openCheckout(page);
  await fillCheckout(page, { ...JAIPUR, email: uniqueEmail("phone") });
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByText(/Thank you! Your order is confirmed/)).toBeVisible();
  // Nothing should overflow sideways on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // The language switch is still there on a phone.
  await expect(page.getByRole("link", { name: "हिंदी" })).toBeVisible();
});
