import { expect, test } from "@playwright/test";
import { addAProductToCart, fillCheckout, JAIPUR, openCheckout, query, uniqueEmail } from "./helpers";

test.describe("checkout", () => {
  test("pays online and gets a confirmed order", async ({ page }) => {
    await addAProductToCart(page);
    await openCheckout(page);
    const email = uniqueEmail("prepaid");
    await fillCheckout(page, { ...JAIPUR, email });
    const pay = page.getByRole("button", { name: /^Pay ₹/ });
    await expect(pay).toBeEnabled();
    await pay.click();

    const dialog = page.getByText("Simulated payment");
    await expect(dialog).toBeVisible();
    await page.getByRole("button", { name: "Simulate successful payment" }).click();

    await expect(page).toHaveURL(/\/orders\/\d+\?t=.*placed=1/);
    await expect(page.getByText(/Thank you! Your order is confirmed/)).toBeVisible();
    const [order] = await query<{ status: string; payment_status: string }>("select status, payment_status from orders where email = $1", [email]);
    expect(order).toEqual({ status: "CONFIRMED", payment_status: "PAID" });
  });

  test("a failed payment can be retried from the order page", async ({ page }) => {
    await addAProductToCart(page);
    await openCheckout(page);
    const email = uniqueEmail("retry");
    await fillCheckout(page, { ...JAIPUR, email });
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
    await page.getByRole("button", { name: "Simulate failed payment" }).click();

    await expect(page).toHaveURL(/\/orders\/\d+/);
    await page.getByRole("button", { name: "Pay now" }).click();
    await page.getByRole("button", { name: "Simulate successful payment" }).click();
    await expect(page.getByText(/Thank you! Your order is confirmed/)).toBeVisible();
    const [order] = await query<{ status: string }>("select status from orders where email = $1", [email]);
    expect(order.status).toBe("CONFIRMED");
  });

  test("cash on delivery is confirmed from the emailed link", async ({ page }) => {
    await addAProductToCart(page);
    await openCheckout(page);
    const email = uniqueEmail("cod");
    await fillCheckout(page, { ...JAIPUR, email });
    await page.getByRole("radio", { name: /Cash on delivery/ }).check();
    await page.getByRole("button", { name: /^Place order · ₹/ }).click();

    await expect(page).toHaveURL(/\/orders\/\d+/);
    await expect(page.getByText("Awaiting your confirmation")).toBeVisible();

    const [mail] = await query<{ html: string }>("select html from email_log where template = 'cod-confirm' and \"to\" = $1", [email]);
    const link = /href="([^"]*confirm=[^"]*)"/.exec(mail.html)![1].replaceAll("&amp;", "&");
    await page.goto(new URL(link).pathname + new URL(link).search);
    await page.getByRole("button", { name: "Confirm my cash-on-delivery order" }).click();
    await expect(page.getByText(/Your order is confirmed and we'll start packing it/)).toBeVisible();
  });

  test("checks the form before placing an order and keeps what was typed", async ({ page }) => {
    await addAProductToCart(page);
    await openCheckout(page);
    await fillCheckout(page, { ...JAIPUR, email: "asha@", name: "R2", phone: "12345", state: "Delhi" });
    await page.getByRole("button", { name: /^Pay ₹/ }).click();

    // Browser-side checks: errors next to the fields, focus on the first problem, nothing placed.
    await expect(page.getByText("Enter a valid email address, like name@example.com.")).toBeVisible();
    await expect(page.getByText("Names can't contain numbers.")).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("R2");

    // Fix those; the server then rejects the state that doesn't match the pincode.
    await page.getByLabel("Email", { exact: true }).fill(uniqueEmail("state"));
    await page.getByLabel("Full name", { exact: true }).fill("Asha Rao");
    await page.getByLabel("Mobile number", { exact: true }).fill("9876543210");
    await page.getByRole("button", { name: /^Pay ₹/ }).click();
    await expect(page.getByText("Pincode 302001 is in Rajasthan. Choose Rajasthan, or check the pincode.")).toBeVisible();
    await expect(page.getByText("Simulated payment")).toHaveCount(0);
  });

  test("tells the customer when a pincode can't be delivered to", async ({ page }) => {
    await addAProductToCart(page);
    await openCheckout(page);
    await fillCheckout(page, { ...JAIPUR, email: uniqueEmail("nodeliver"), pincode: "999999" });
    await expect(page.getByRole("button", { name: "Enter a deliverable pincode" })).toBeDisabled();
  });
});
