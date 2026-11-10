import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:54329/farmdoor_e2e";

/** Runs one query against the browser-test database (to read emails the store "sent"). */
export async function query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

/** Opens the first product in the shop and adds its default pack to the cart. */
export async function addAProductToCart(page: Page) {
  await page.goto("/shop");
  await page.locator('main a[href^="/products/"]').first().click();
  await expect(page).toHaveURL(/\/products\//);
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByText(/Added to your cart/)).toBeVisible();
}

export type Address = { email: string; name: string; phone: string; line1: string; pincode: string; city: string; state: string };

export const JAIPUR: Address = { email: "", name: "Asha Rao", phone: "9876543210", line1: "12 MG Road, Civil Lines", pincode: "302001", city: "Jaipur", state: "Rajasthan" };

export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}@example.com`;

export async function fillCheckout(page: Page, a: Address) {
  await page.getByLabel("Email", { exact: true }).fill(a.email);
  await page.getByLabel("Full name", { exact: true }).fill(a.name);
  await page.getByLabel("Mobile number", { exact: true }).fill(a.phone);
  await page.getByLabel("House / flat, street", { exact: true }).fill(a.line1);
  await page.getByLabel("Pincode", { exact: true }).fill(a.pincode);
  await page.getByLabel("City", { exact: true }).fill(a.city);
  await page.getByLabel("State", { exact: true }).selectOption(a.state);
}

/** Goes from the cart to checkout, waiting until the shipping charge is worked out. */
export async function openCheckout(page: Page) {
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Order summary" })).toBeVisible();
}
