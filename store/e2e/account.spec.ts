import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addAProductToCart, fillCheckout, JAIPUR, openCheckout, query, uniqueEmail } from "./helpers";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const problems = results.violations.map((v) => `${label}: [${v.impact}] ${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`);
  expect(problems, problems.join("\n")).toEqual([]);
}

/** A 2×2 red PNG, standing in for a phone photo. */
const PHOTO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");

async function paidOrder(page: Page, email: string) {
  await addAProductToCart(page);
  await openCheckout(page);
  await fillCheckout(page, { ...JAIPUR, email });
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page).toHaveURL(/\/orders\/\d+\?t=/);
  return page.url();
}

test.describe("after delivery", () => {
  test("the customer reports a damaged item with a photo, and the store sees it", async ({ page }) => {
    const email = uniqueEmail("problem");
    const orderUrl = await paidOrder(page, email);
    await query("update orders set status = 'DELIVERED', delivered_at = now() - interval '2 hours' where email = $1", [email]);
    await page.goto(orderUrl.replace(/&placed=1/, ""));

    await page.getByRole("button", { name: "Report a problem" }).click();
    await expectAccessible(page, "order page with problem form");

    // Sending without choosing a problem or adding a photo explains what's missing.
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText("Choose what went wrong.")).toBeVisible();
    await expect(page.getByText("Add at least one photo of the item and its packaging.")).toBeVisible();

    await page.getByRole("radio", { name: "Damaged or leaking" }).check();
    await page.getByLabel("Tell us what happened").fill("The jar lid was cracked and some powder spilled.");
    await page.getByLabel(/Photos of the item and packaging/).setInputFiles({ name: "parcel.png", mimeType: "image/png", buffer: PHOTO });
    await expect(page.getByRole("img", { name: "Photo 1" })).toBeVisible();
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText(/We've got your report and photos/)).toBeVisible();

    const [report] = await query<{ kind: string; status: string; photos: number }>(
      "select r.kind, r.status, (select count(*)::int from problem_photos p where p.report_id = r.id) as photos from problem_reports r join orders o on o.id = r.order_id where o.email = $1",
      [email],
    );
    expect(report).toEqual({ kind: "DAMAGED", status: "OPEN", photos: 1 });
    await page.reload();
    await expect(page.getByText(/You reported: damaged or leaking/)).toBeVisible();
  });

  test("a signed-in customer's account page is accessible and offers their data", async ({ page }) => {
    const email = uniqueEmail("account");
    await paidOrder(page, email);
    await page.goto("/login");
    await page.getByRole("main").getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Email me a sign-in code" }).click();
    await expect(page.getByLabel("6-digit code")).toBeVisible();
    const [mail] = await query<{ html: string }>("select html from email_log where \"to\" = $1 and template = 'login-code' order by id desc limit 1", [email]);
    const code = mail.html.match(/\b(\d{6})\b/)![1];
    await page.getByLabel("6-digit code").fill(code);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/account/);
    await expectAccessible(page, "account");

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download my data" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^the-farm-door-my-data-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
