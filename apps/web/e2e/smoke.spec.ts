import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = "http://localhost:3000/api/v1";
const PASSWORD = "E2ePassword1234";
const marker = Date.now().toString(36);

async function apiRegister(request: APIRequestContext, name: string, org: string) {
  const email = `e2e-${name}-${marker}@example.com`;
  const res = await request.post(`${API}/auth/register`, {
    data: { name, email, password: PASSWORD, organizationName: org }
  });
  expect(res.status()).toBe(201);
  return { email, orgId: (await res.json()).organizations[0].id as string };
}

async function uiLogin(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 20_000 });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("nexora-language", "en"));
});

test("public pages render and navigation works", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible();
  await page.goto("/register");
  await expect(page.locator("#organization")).toBeVisible();
});

test("new user registers and lands on the dashboard", async ({ page }) => {
  const email = `e2e-reg-${marker}@example.com`;
  await page.goto("/register");
  await page.fill("#name", "E2E Admin");
  await page.fill("#organization", `E2E Org ${marker}`);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 20_000 });
  await expect(page).toHaveURL(/dashboard/);
});

test("wrong password shows an error and stays on login", async ({ page, request }) => {
  const { email } = await apiRegister(request, "wp", `E2E WP Org ${marker}`);
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "WrongPassword999");
  await page.click('button[type="submit"]');
  await expect(page.locator('[role="alert"], .nx-alert, [class*="danger"]').first()).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/login/);
});

test("task created through the UI appears in the list", async ({ page, request }) => {
  const { email } = await apiRegister(request, "task", `E2E Task Org ${marker}`);
  await uiLogin(page, email);
  await page.goto("/tasks");
  const title = `E2E task ${marker}`;
  await page.getByRole("button", { name: /new task|create task/i }).first().click();
  await page.fill("#task-title", title);
  await page.locator('button[type="submit"][form="new-task-form"]').click();
  // successful creation navigates to the task detail page
  await page.waitForURL(/\/tasks\/.+/, { timeout: 15_000 });
  await expect(page.locator(`text=${title}`).first()).toBeVisible({ timeout: 15_000 });
});

test("logout revokes the session and protected routes redirect to login", async ({ page, request }) => {
  const { email } = await apiRegister(request, "lo", `E2E LO Org ${marker}`);
  await uiLogin(page, email);
  // open user dropdown (avatar button in header) and click "Sign out"
  await page.locator("header button").last().click();
  await page.getByRole("menuitem", { name: /sign out|terminar/i }).click();
  await page.waitForURL(/login|\/$/, { timeout: 15_000 });
  await page.goto("/tasks");
  await page.waitForURL(/login/, { timeout: 15_000 });
  // API session is really gone
  const me = await page.request.get(`${API}/auth/me`);
  expect(me.status()).toBe(401);
});

test("tenant isolation in the browser: user A cannot reach org B resources", async ({ page, request }) => {
  const a = await apiRegister(request, "ta", `E2E TenantA ${marker}`);
  const b = await apiRegister(request, "tb", `E2E TenantB ${marker}`);

  // create a task in org B via API using B's cookies
  const bLogin = await request.post(`${API}/auth/login`, { data: { email: b.email, password: PASSWORD } });
  const bCookie = (bLogin.headers()["set-cookie"] ?? "").split(";")[0];
  const taskB = await request.post(`${API}/organizations/${b.orgId}/tasks`, {
    data: { title: "secret B task" },
    headers: { cookie: bCookie }
  });
  expect(taskB.status()).toBe(201);
  const taskBId = (await taskB.json()).id;

  // login as A in the browser, then ask the API for B's task and org
  await uiLogin(page, a.email);
  const resTask = await page.request.get(`${API}/organizations/${b.orgId}/tasks/${taskBId}`);
  expect([403, 404]).toContain(resTask.status());
  const resList = await page.request.get(`${API}/organizations/${b.orgId}/tasks`);
  expect([403, 404]).toContain(resList.status());
});
