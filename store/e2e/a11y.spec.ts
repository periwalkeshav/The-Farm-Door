import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addAProductToCart } from "./helpers";

/**
 * Accessibility: every main page is checked with axe (WCAG 2.2 A and AA rules:
 * contrast, labels, headings, landmarks, names for buttons and links, …).
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function check(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const problems = results.violations.map((v) => `${label}: [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}×: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`);
  expect(problems, problems.join("\n")).toEqual([]);
}

const PAGES = ["/", "/shop", "/shop?q=haldi", "/shop?q=zzzz", "/recipes", "/about", "/contact", "/faq", "/bulk-orders", "/track", "/login", "/policies/privacy", "/policies/refunds", "/this-page-does-not-exist", "/admin/login"];

test.describe("accessibility", () => {
  for (const path of PAGES) {
    test(`page ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await check(page, path);
    });
  }

  test("product, category, recipe, cart and checkout pages", async ({ page }) => {
    await page.goto("/shop");
    await page.locator('main a[href^="/category/"]').first().click();
    await page.waitForLoadState("networkidle");
    await check(page, "category");

    await page.goto("/recipes");
    const recipe = page.locator('main a[href^="/recipes/"]').first();
    if (await recipe.count()) {
      await recipe.click();
      await page.waitForLoadState("networkidle");
      await check(page, "recipe");
    }

    await addAProductToCart(page);
    await check(page, "product");
    await page.goto("/cart");
    await page.waitForLoadState("networkidle");
    await check(page, "cart");
    await page.goto("/checkout");
    await page.waitForLoadState("networkidle");
    await check(page, "checkout");
  });

  test("home banner can be stepped through, and all animations paused", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("region", { name: "Highlights" });
    await expect(banner.getByRole("button", { name: /Show slide 1/ })).toHaveAttribute("aria-current", "true");
    await banner.getByRole("button", { name: "Next slide" }).click();
    await expect(banner.getByRole("button", { name: /Show slide 2/ })).toHaveAttribute("aria-current", "true");
    await page.waitForTimeout(900); // let the slide finish fading in before checking colours
    await check(page, "home banner, slide 2");
    await expect(banner.getByRole("button", { name: /Stop slide show|Pause/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Pause animations" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
    await page.getByRole("button", { name: "Play animations" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-motion", "paused");
  });

  test("search suggestions", async ({ page }) => {
    await page.goto("/shop");
    await page.getByRole("combobox", { name: "Search", exact: true }).fill("tur");
    await expect(page.getByRole("listbox", { name: "Suggestions" })).toBeVisible();
    await check(page, "search suggestions");
  });
});
