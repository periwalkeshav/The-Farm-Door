import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { JAIPUR, query, uniqueEmail } from "./helpers";

/** The Hindi shop (/hi): switching language, remembering it, buying, form checks and accessibility. */

async function addInHindi(page: Page) {
  await page.goto("/hi/shop");
  await page.locator('main a[href^="/hi/products/"]').first().click();
  await expect(page).toHaveURL(/\/hi\/products\//);
  await page.getByRole("button", { name: "कार्ट में डालें", exact: true }).click();
  await expect(page.getByText(/कार्ट में जोड़ दिया गया/)).toBeVisible();
}

test.describe("Hindi shop", () => {
  test("the header switch opens the same page in Hindi, and the choice is remembered", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator("html")).toHaveAttribute("lang", "en-IN");
    await page.getByRole("link", { name: "हिंदी" }).first().click();

    await expect(page).toHaveURL(/\/hi\/shop$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "hi-IN");
    await expect(page.getByRole("heading", { level: 1, name: "सभी प्रोडक्ट" })).toBeVisible();
    // Search engines are told about both versions.
    await expect(page.locator('link[rel="alternate"][hreflang="hi-IN"]')).toHaveAttribute("href", /\/hi\/shop$/);

    // A plain address (say, from an email) now opens in Hindi.
    await page.goto("/faq");
    await expect(page).toHaveURL(/\/hi\/faq$/);
    await expect(page.getByRole("heading", { level: 1, name: "अक्सर पूछे जाने वाले सवाल" })).toBeVisible();

    // And back to English.
    await page.getByRole("link", { name: "English" }).first().click();
    await expect(page).toHaveURL(/\/faq$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en-IN");
    await page.goto("/shop");
    await expect(page).toHaveURL(/\/shop$/);
  });

  test("product names, options and prices show in Hindi", async ({ page }) => {
    await page.goto("/hi/products/red-chilli-powder");
    await expect(page.getByRole("heading", { level: 1, name: "लाल मिर्च पाउडर" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /कम तीखा/ }).or(page.getByRole("button", { name: /कम तीखा/ })).first()).toBeVisible();
    await expect(page.getByText("दामों में GST शामिल है", { exact: false }).first()).toBeVisible();
  });

  test("checks the checkout form in Hindi, then pays online", async ({ page }) => {
    await addInHindi(page);
    await page.goto("/hi/checkout");
    await expect(page.getByRole("heading", { name: "ऑर्डर सारांश" })).toBeVisible();

    await page.getByLabel("पूरा नाम", { exact: true }).fill(JAIPUR.name);
    await page.getByLabel("मोबाइल नंबर", { exact: true }).fill("12345");
    await page.getByLabel("मकान / फ़्लैट, गली", { exact: true }).fill(JAIPUR.line1);
    await page.getByLabel("पिनकोड", { exact: true }).fill(JAIPUR.pincode);
    await page.getByLabel("शहर", { exact: true }).fill(JAIPUR.city);
    await page.getByLabel("राज्य", { exact: true }).selectOption(JAIPUR.state);
    const pay = page.getByRole("button", { name: /^₹[\d,]+ भुगतान करें$/ });
    await expect(pay).toBeEnabled();
    await pay.click();
    await expect(page.getByText("अपना ईमेल पता डालें।")).toBeVisible();
    await expect(page.getByText(/10 अंकों का भारतीय मोबाइल नंबर डालें/)).toBeVisible();

    const email = uniqueEmail("hindi");
    await page.getByLabel("ईमेल", { exact: true }).fill(email);
    await page.getByLabel("मोबाइल नंबर", { exact: true }).fill(JAIPUR.phone);
    await pay.click();
    await expect(page.getByText("सिम्युलेटेड भुगतान", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "सफल भुगतान का सिम्युलेशन", exact: true }).click();

    await expect(page).toHaveURL(/\/hi\/orders\/\d+\?t=.*placed=1/);
    await expect(page.getByText(/धन्यवाद! आपका ऑर्डर पक्का हो गया है/)).toBeVisible();
    const [order] = await query<{ status: string }>("select status from orders where email = $1", [email]);
    expect(order.status).toBe("CONFIRMED");
  });

  test("Hindi pages pass the accessibility check", async ({ page }) => {
    const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
    await addInHindi(page);
    for (const path of ["/hi", "/hi/shop", "/hi/products/turmeric-powder", "/hi/category/spices", "/hi/cart", "/hi/checkout", "/hi/faq", "/hi/policies/privacy", "/hi/login", "/hi/nope"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const problems = results.violations.map((v) => `${path}: [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}×: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`);
      expect(problems, problems.join("\n")).toEqual([]);
    }
  });
});

test("the admin panel runs under its strict security policy", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) blocked.push(m.text());
  });
  const response = await page.goto("/admin/login");
  const policy = response!.headers()["content-security-policy"];
  expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(policy).not.toContain("unsafe-inline' https://checkout.razorpay.com");
  // The sign-in form is interactive (its scripts ran): an empty submit shows the form's own check.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/Enter your email address|Enter your work email|Enter your password/).first()).toBeVisible();
  expect(blocked).toEqual([]);
});
