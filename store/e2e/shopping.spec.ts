import { expect, test } from "@playwright/test";

test.describe("buying faster", () => {
  test("adds a chosen pack straight from a product card", async ({ page }) => {
    await page.goto("/shop");
    // Garam masala has Pouch/Jar × 100 g/200 g: four packs in one dropdown, all in stock in the sample data.
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Garam Masala" }) });
    const name = "Garam Masala";
    const select = card.getByRole("combobox", { name: `Pack size for ${name}` });
    await expect(select.getByRole("option")).toHaveCount(4);
    await expect(card.getByText("₹110", { exact: true })).toBeVisible();
    const pack = "Jar · 200 g";
    await select.selectOption({ label: pack });
    // The price follows the chosen pack.
    await expect(card.getByText("₹260", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: `Add to cart: ${name}, ${pack}` }).click();
    await expect(page.getByText(`${name}, ${pack} added`)).toBeVisible();
    await page.goto("/cart");
    await expect(page.getByRole("link", { name, exact: true }).first()).toBeVisible();
    await expect(page.getByText(pack, { exact: true }).first()).toBeVisible();
  });

  test("the product page has a sticky add-to-cart bar and adds a bundle in one go", async ({ page }) => {
    await page.goto("/shop");
    await page.locator('main a[href^="/products/"]').first().click();
    await expect(page.getByRole("button", { name: "Add to cart", exact: true })).toHaveCount(1);
    await page.mouse.wheel(0, 1500);
    await expect(page.getByRole("button", { name: "Add to cart", exact: true })).toHaveCount(2);

    const bundle = page.getByRole("button", { name: /^Add all \d to cart$/ });
    await bundle.scrollIntoViewIfNeeded();
    const n = Number((await bundle.textContent())!.match(/\d/)![0]);
    await bundle.click();
    await expect(page.getByText(`${n} items added to your cart`).first()).toBeVisible();
    await page.goto("/cart");
    await expect(page.locator("main li").filter({ has: page.locator('a[href^="/products/"]') })).toHaveCount(n);
  });

  test("categories: the header menu, and filter buttons inside Spices", async ({ page }) => {
    await page.goto("/");
    const menu = page.getByRole("button", { name: "Categories" });
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("link", { name: "Spices", exact: true }).first().click();
    await expect(page).toHaveURL(/\/category\/spices$/);

    const filters = page.getByRole("navigation", { name: "Filter Spices" });
    await expect(filters.getByRole("link")).toHaveText(["All", "Whole spices", "Ground spices", "Masala blends"]);
    const all = Number((await page.getByText(/^\d+ products$/).textContent())!.match(/\d+/)![0]);
    await filters.getByRole("link", { name: "Ground spices" }).click();
    await expect(page).toHaveURL(/group=ground-spices/);
    await expect(filters.getByRole("link", { name: "Ground spices" })).toHaveAttribute("aria-current", "page");
    const ground = Number((await page.getByText(/^\d+ products?$/).textContent())!.match(/\d+/)![0]);
    expect(ground).toBeGreaterThan(0);
    expect(ground).toBeLessThan(all);
  });

  test("oils are priced per 100 ml", async ({ page }) => {
    await page.goto("/products/cold-pressed-mustard-oil");
    await expect(page.getByText(/\/ 100 ml · MRP incl\. of all taxes/)).toBeVisible();
    await expect(page.getByText(/Net quantity 500 ml/)).toBeVisible();
  });
});
