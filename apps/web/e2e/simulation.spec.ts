import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Live simulation: 5 users (Admin, Manager, Editor, Member, Viewer) in one org
// touring the real app. Run headed to watch: npx playwright test e2e/simulation.spec.ts --headed

const API = "http://localhost:3000/api/v1";
const PASSWORD = "SimUser12345";
const marker = Date.now().toString(36);

test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);
test.use({ launchOptions: { slowMo: 350 } });

interface User {
  role: string;
  email: string;
  name: string;
}

const org = `Sim Org ${marker}`;
const users: User[] = [
  { role: "Admin", email: `sim-admin-${marker}@example.com`, name: "Sim Admin" },
  { role: "Manager", email: `sim-manager-${marker}@example.com`, name: "Sim Manager" },
  { role: "Editor", email: `sim-editor-${marker}@example.com`, name: "Sim Editor" },
  { role: "Member", email: `sim-member-${marker}@example.com`, name: "Sim Member" },
  { role: "Viewer", email: `sim-viewer-${marker}@example.com`, name: "Sim Viewer" }
];

let orgId = "";
let adminCookie = "";

async function api(request: APIRequestContext, method: string, path: string, cookie: string, data?: unknown) {
  const res = await request.fetch(`${API}${path}`, { method, data, headers: { cookie } });
  return res;
}

test.beforeAll(async ({ request }) => {
  // register admin + org
  const reg = await request.post(`${API}/auth/register`, {
    data: { name: users[0]!.name, email: users[0]!.email, password: PASSWORD, organizationName: org }
  });
  expect(reg.status()).toBe(201);
  orgId = (await reg.json()).organizations[0].id;
  adminCookie = (reg.headers()["set-cookie"] ?? "").split(";").filter((c) => c.trim().startsWith("nexora_")).map((c) => c.trim().split("=")[0] + "=" + c.trim().split("=").slice(1).join("=").split(";")[0]).join("; ");
  adminCookie = (reg.headers()["set-cookie"] ?? "").split(",").map((c) => c.split(";")[0]!.trim()).filter((c) => c.startsWith("nexora_")).join("; ");

  // create the other 4 members (Free plan = 5 users max)
  for (const u of users.slice(1)) {
    const res = await api(request, "POST", `/organizations/${orgId}/users`, adminCookie, {
      name: u.name, email: u.email, password: PASSWORD, role: u.role
    });
    expect(res.status(), `${u.role}: ${await res.text()}`).toBe(201);
  }

  // seed content so every tour has data to look at
  await api(request, "POST", `/organizations/${orgId}/tasks`, adminCookie, { title: `Sim seed task ${marker}`, priority: "HIGH" });
  await api(request, "POST", `/organizations/${orgId}/lists`, adminCookie, { name: `Sim list ${marker}` });
  await api(request, "POST", `/organizations/${orgId}/folders`, adminCookie, { name: `Sim folder ${marker}` });
  const upload = await request.post(`${API}/organizations/${orgId}/documents`, {
    headers: { cookie: adminCookie },
    multipart: { file: { name: `sim-doc-${marker}.txt`, mimeType: "text/plain", buffer: Buffer.from("Nexora seeded document") } }
  });
  expect(upload.status(), await upload.text()).toBe(201);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("nexora-language", "pt-PT"));
});

// pausa visível entre ecrãs para acompanhamento ao vivo
const DWELL_MS = 900;

async function uiLogin(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForTimeout(DWELL_MS);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|my-day)/, { timeout: 20_000 });
  await page.waitForTimeout(DWELL_MS);
}

// A transient 429 on auth/me bounces the SPA to /login even though the cookies are
// still valid — re-authenticate and retry the destination instead of failing.
async function visit(page: Page, path: string, email?: string) {
  await page.goto(path);
  if ((page.url().includes("/login") || /\/$/.test(new URL(page.url()).pathname)) && email) {
    await uiLogin(page, email);
    await page.goto(path);
  }
  await expect(page.locator("h1, h2, main").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(DWELL_MS);
}

async function uiLogout(page: Page, email: string) {
  // garante que estamos numa página autenticada antes de abrir o menu de utilizador
  await page.goto("/my-day");
  await page.waitForTimeout(DWELL_MS);
  if (!(await page.locator("header button").count())) {
    await uiLogin(page, email);
    await page.goto("/my-day");
  }
  try {
    await page.locator("header button").last().click({ timeout: 6_000 });
    await page.getByRole("menuitem", { name: /sign out|terminar/i }).click({ timeout: 6_000 });
  } catch {
    // fallback: revogação server-side via API com os cookies da página
    await page.request.post(`${API}/auth/logout`);
    await page.goto("/login");
  }
  await page.waitForURL(/login|\/$/, { timeout: 15_000 });
}

test("Admin — full tour: dashboard, tasks, documents+upload, lists, forms, workflows, notifications, search, admin, settings, profile, logout", async ({ page }) => {
  const me = users[0]!.email;
  await uiLogin(page, me);

  await visit(page, "/dashboard", me);
  await visit(page, "/my-day", me);

  // create a task through the UI
  await visit(page, "/tasks", me);
  await page.getByRole("button", { name: /new task|nova tarefa/i }).first().click();
  await page.waitForTimeout(DWELL_MS);
  await page.fill("#task-title", `Sim admin task ${marker}`);
  await page.locator('button[type="submit"][form="new-task-form"]').click();
  await page.waitForURL(/\/tasks\/.+/, { timeout: 15_000 });
  await page.waitForTimeout(DWELL_MS);
  await page.goBack();

  // upload a document through the hidden file input
  await visit(page, "/documents", me);
  await page.locator('input[type="file"]').first().setInputFiles({
    name: `sim-doc-${marker}.txt`,
    mimeType: "text/plain",
    buffer: Buffer.from("Nexora live simulation document")
  });
  await expect(page.locator(`text=sim-doc-${marker}.txt`).first()).toBeVisible({ timeout: 20_000 });

  await visit(page, "/lists", me);
  await visit(page, "/forms", me);
  await visit(page, "/workflows", me);
  await visit(page, "/approvals", me);
  await visit(page, "/news", me);
  await visit(page, "/notifications", me);
  await visit(page, "/search", me);
  await visit(page, "/admin", me);
  await visit(page, "/settings", me);
  await visit(page, "/profile", me);
  await visit(page, "/billing", me);

  await uiLogout(page, me);
});

test("Manager — operational tour: dashboard, tasks (create), lists, documents, workflows, approvals, logout", async ({ page }) => {
  const me = users[1]!.email;
  await uiLogin(page, me);

  await visit(page, "/dashboard", me);
  await visit(page, "/tasks", me);
  await page.getByRole("button", { name: /new task|nova tarefa/i }).first().click();
  await page.waitForTimeout(DWELL_MS);
  await page.fill("#task-title", `Sim manager task ${marker}`);
  await page.locator('button[type="submit"][form="new-task-form"]').click();
  await page.waitForURL(/\/tasks\/.+/, { timeout: 15_000 });
  await page.waitForTimeout(DWELL_MS);
  await page.goBack();

  await visit(page, "/lists", me);
  await visit(page, "/documents", me);
  await visit(page, "/workflows", me);
  await visit(page, "/approvals", me);
  await visit(page, "/notifications", me);

  await uiLogout(page, me);
});

test("Editor — content tour: my-day, documents, news, tasks, search, logout", async ({ page }) => {
  const me = users[2]!.email;
  await uiLogin(page, me);

  await visit(page, "/my-day", me);
  await visit(page, "/documents", me);
  await expect(page.locator(`text=sim-doc-${marker}.txt`).first()).toBeVisible({ timeout: 15_000 });
  await visit(page, "/news", me);
  await visit(page, "/tasks", me);
  await visit(page, "/search", me);

  await uiLogout(page, me);
});

test("Member — daily work: my-day, tasks, documents, notifications, profile, logout", async ({ page }) => {
  const me = users[3]!.email;
  await uiLogin(page, me);

  // members cannot reach admin — checked right after login while the session is fresh
  await page.goto("/admin");
  await page.waitForURL(/\/dashboard|\/login/, { timeout: 15_000 });
  if (page.url().includes("/login")) await uiLogin(page, me);
  await expect(page).not.toHaveURL(/\/admin$/);

  await visit(page, "/my-day", me);
  await visit(page, "/tasks", me);
  await visit(page, "/documents", me);
  await visit(page, "/notifications", me);

  await uiLogout(page, me);
});

test("Viewer — read-only: sees content, cannot create; API denies writes; admin blocked; logout", async ({ page }) => {
  const me = users[4]!.email;
  await uiLogin(page, me);

  await visit(page, "/tasks", me);
  // viewer sees the seeded task
  await expect(page.locator(`text=Sim seed task ${marker}`).first()).toBeVisible({ timeout: 15_000 });
  // the "New task" button may still render for viewers — if so, submitting must fail at the API
  const newTaskBtn = page.getByRole("button", { name: /new task|nova tarefa/i }).first();
  if (await newTaskBtn.count()) {
    await newTaskBtn.click();
    await page.waitForTimeout(DWELL_MS);
    await page.fill("#task-title", "viewer must not create");
    await page.locator('button[type="submit"][form="new-task-form"]').click();
    // must NOT navigate to a task detail page; an error or dialog close without creation is expected
    await page.waitForTimeout(DWELL_MS);
    await expect(page).not.toHaveURL(/\/tasks\/.+/);
  }

  await visit(page, "/documents", me);
  await expect(page.locator(`text=sim-doc-${marker}.txt`).first()).toBeVisible({ timeout: 15_000 });

  // UI hidden is not security — verify the API itself denies the write
  const denied = await page.request.post(`${API}/organizations/${orgId}/tasks`, { data: { title: "viewer should fail" } });
  expect([401, 403]).toContain(denied.status());

  await page.goto("/admin");
  await page.waitForURL(/\/dashboard|\/login/, { timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/admin$/);
  await visit(page, "/my-day", me);

  await uiLogout(page, me);
});
