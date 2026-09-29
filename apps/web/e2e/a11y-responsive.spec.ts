import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const API = "http://localhost:3000/api/v1";
const PASSWORD = "E2ePassword1234";
const marker = Date.now().toString(36);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("nexora-language", "en"));
});

test("public pages have no critical accessibility violations", async ({ page }) => {
  for (const path of ["/", "/login", "/register"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const critical = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(critical.map((v) => `${path}: ${v.id} (${v.impact}) — ${v.nodes.length} node(s)`)).toEqual([]);
  }
});

test("authenticated app shell has no critical accessibility violations", async ({ page, request }) => {
  const email = `e2e-a11y-${marker}@example.com`;
  await request.post(`${API}/auth/register`, {
    data: { name: "A11y User", email, password: PASSWORD, organizationName: `A11y Org ${marker}` }
  });
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 20_000 });
  await page.goto("/tasks");
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical.map((v) => `${v.id} (${v.impact}) — ${v.nodes.length} node(s)`)).toEqual([]);
});

test("mobile viewport: navigation collapses into a hamburger menu", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const email = `e2e-mob-${marker}@example.com`;
  await request.post(`${API}/auth/register`, {
    data: { name: "Mobile User", email, password: PASSWORD, organizationName: `Mobile Org ${marker}` }
  });
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 20_000 });
  // sidebar is hidden on mobile; the hamburger button (aria-label "Menu") must be visible
  const menuButton = page.locator('button[aria-label="Menu"], button[aria-label*="menu" i]').first();
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  // mobile nav opens
  await expect(page.locator("nav a").first()).toBeVisible({ timeout: 5_000 });
});
