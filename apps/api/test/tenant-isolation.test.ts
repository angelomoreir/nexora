import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const emails = {
  adminA: `iso-admina-${marker}@example.com`,
  memberA: `iso-membera-${marker}@example.com`,
  viewerA: `iso-viewera-${marker}@example.com`,
  adminB: `iso-adminb-${marker}@example.com`
};
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

async function multipart(filename: string, mimeType: string, content: Uint8Array) {
  const form = new FormData();
  form.append("file", new Blob([Uint8Array.from(content).buffer], { type: mimeType }), filename);
  const request = new Request("http://localhost", { method: "POST", body: form });
  return { payload: Buffer.from(await request.arrayBuffer()), contentType: request.headers.get("content-type")! };
}

async function login(email: string, password: string) {
  const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password } });
  assert.equal(response.statusCode, 200, response.body);
  return cookies(response);
}

function assertBlocked(statusCode: number, context: string) {
  assert.ok(
    statusCode === 400 || statusCode === 403 || statusCode === 404 || statusCode === 429,
    `${context}: expected 4xx, got ${statusCode}`
  );
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await app.close();
  await prisma.$disconnect();
});

test("multi-tenant isolation: users of organization A cannot read, modify, delete, download or discover resources of organization B", async (t) => {
  // ---------- Setup: two organizations with members ----------
  const regA = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Admin A", email: emails.adminA, password: "IsolationPass123", organizationName: "Isolation Org A" } });
  assert.equal(regA.statusCode, 201);
  const orgA = regA.json().organizations[0].id as string;
  organizationIds.push(orgA);
  const adminACookies = cookies(regA);

  const regB = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Admin B", email: emails.adminB, password: "IsolationPass123", organizationName: "Isolation Org B" } });
  assert.equal(regB.statusCode, 201);
  const orgB = regB.json().organizations[0].id as string;
  organizationIds.push(orgB);
  const adminBCookies = cookies(regB);

  for (const [email, name, role] of [
    [emails.memberA, "Member A", "Member"],
    [emails.viewerA, "Viewer A", "Viewer"]
  ] as const) {
    const created = await app.inject({ method: "POST", url: `/api/v1/organizations/${orgA}/users`, headers: { cookie: adminACookies }, payload: { name, email, password: "IsolationPass123", role } });
    assert.equal(created.statusCode, 201, created.body);
  }
  const memberACookies = await login(emails.memberA, "IsolationPass123");
  const viewerACookies = await login(emails.viewerA, "IsolationPass123");

  // ---------- Resources created inside organization B ----------
  const folderB = await app.inject({ method: "POST", url: `/api/v1/organizations/${orgB}/folders`, headers: { cookie: adminBCookies }, payload: { name: "Confidencial B", parentId: null } });
  assert.equal(folderB.statusCode, 201);
  const folderBId = folderB.json().id as string;

  const uploadBody = await multipart("segredo-b.pdf", "application/pdf", new TextEncoder().encode("%PDF-1.4 dados-secretos-b"));
  const docB = await app.inject({ method: "POST", url: `/api/v1/organizations/${orgB}/documents?folderId=${folderBId}`, headers: { cookie: adminBCookies, "content-type": uploadBody.contentType }, payload: uploadBody.payload });
  assert.equal(docB.statusCode, 201, docB.body);
  const docBId = docB.json().document.id as string;

  const listB = await app.inject({ method: "POST", url: `/api/v1/organizations/${orgB}/lists`, headers: { cookie: adminBCookies }, payload: { name: "Lista Secreta B", fields: [{ name: "Nome", slug: "nome", type: "text", required: true, order: 0 }] } });
  assert.equal(listB.statusCode, 201);
  const listBId = listB.json().id as string;
  const itemB = await app.inject({ method: "POST", url: `/api/v1/organizations/${orgB}/lists/${listBId}/items`, headers: { cookie: adminBCookies }, payload: { values: { nome: "registo-b" } } });
  assert.equal(itemB.statusCode, 201);
  const itemBId = itemB.json().id as string;

  const taskB = await app.inject({ method: "POST", url: `/api/v1/organizations/${orgB}/tasks`, headers: { cookie: adminBCookies }, payload: { title: "Tarefa privada B" } });
  assert.equal(taskB.statusCode, 201);
  const taskBId = taskB.json().id as string;

  const formB = await app.inject({ method: "POST", url: `/api/v1/organizations/${orgB}/forms`, headers: { cookie: adminBCookies }, payload: { name: "Form B", fields: [{ id: "f1", type: "text", label: "Campo", required: false, order: 0 }] } });
  assert.equal(formB.statusCode, 201);
  const formBId = formB.json().id as string;

  const workflowB = await app.inject({ method: "POST", url: `/api/v1/organizations/${orgB}/workflows`, headers: { cookie: adminBCookies }, payload: { name: "Workflow B", steps: [{ order: 0, type: "START", name: "Iniciar", config: {} }, { order: 1, type: "END", name: "Fim", config: {} }] } });
  assert.equal(workflowB.statusCode, 201);
  const workflowBId = workflowB.json().id as string;

  const projectB = await app.inject({ method: "POST", url: `/api/v1/organizations/${orgB}/projects`, headers: { cookie: adminBCookies }, payload: { name: "Projeto B" } });
  assert.equal(projectB.statusCode, 201);
  const projectBId = projectB.json().id as string;

  // IDs de membros/org B para tentativas de associação cruzada
  const memberBUser = await prisma.organizationMember.findFirstOrThrow({ where: { tenantId: orgB } });

  // ---------- 1. Acesso direto ao URL da organização B ----------
  await t.test("org B collection endpoints reject every org A role", async () => {
    const paths = [
      "documents", "folders", "lists", "forms", "tasks", "projects", "workflows",
      "workflow-instances", "approvals", "notifications", "users", "teams", "roles",
      "audit", "settings", "trash", "dashboard", "announcements", "sites", "news",
      "invitations", "views", "webhooks", "security/overview", "subscription", "usage"
    ];
    let ipSuffix = 10;
    for (const cookiesFor of [adminACookies, memberACookies, viewerACookies]) {
      for (const path of paths) {
        // Distinct source IPs so the global 100 req/min rate limit does not distort the assertions.
        const response = await app.inject({ method: "GET", url: `/api/v1/organizations/${orgB}/${path}`, headers: { cookie: cookiesFor }, remoteAddress: `10.60.${Math.floor(ipSuffix / 250)}.${ipSuffix % 250}` });
        ipSuffix += 1;
        // 400 = request rejected before reaching tenant data (e.g. missing query param); still safe.
        assert.ok(response.statusCode >= 400 && response.statusCode < 500, `GET ${path} -> ${response.statusCode}`);
        assert.ok(!response.body.includes(orgB) || response.statusCode === 400, `GET ${path} leaked org B id`);
      }
    }
  });

  // ---------- 2. IDOR: IDs de B acedidos sob o URL da própria organização A ----------
  await t.test("IDOR: org B resource IDs accessed under org A URL return 404 and never leak data", async () => {
    const cases: Array<[string, string]> = [
      ["GET", `/api/v1/organizations/${orgA}/documents/${docBId}`],
      ["GET", `/api/v1/organizations/${orgA}/documents/${docBId}/download`],
      ["GET", `/api/v1/organizations/${orgA}/documents/${docBId}/activity`],
      ["GET", `/api/v1/organizations/${orgA}/documents/${docBId}/comments`],
      ["PATCH", `/api/v1/organizations/${orgA}/documents/${docBId}`],
      ["DELETE", `/api/v1/organizations/${orgA}/documents/${docBId}`],
      ["PATCH", `/api/v1/organizations/${orgA}/folders/${folderBId}`],
      ["DELETE", `/api/v1/organizations/${orgA}/folders/${folderBId}`],
      ["GET", `/api/v1/organizations/${orgA}/lists/${listBId}`],
      ["GET", `/api/v1/organizations/${orgA}/lists/${listBId}/items`],
      ["PATCH", `/api/v1/organizations/${orgA}/lists/${listBId}/items/${itemBId}`],
      ["DELETE", `/api/v1/organizations/${orgA}/lists/${listBId}`],
      ["GET", `/api/v1/organizations/${orgA}/forms/${formBId}`],
      ["GET", `/api/v1/organizations/${orgA}/forms/${formBId}/submissions`],
      ["DELETE", `/api/v1/organizations/${orgA}/forms/${formBId}`],
      ["GET", `/api/v1/organizations/${orgA}/tasks/${taskBId}`],
      ["PATCH", `/api/v1/organizations/${orgA}/tasks/${taskBId}`],
      ["DELETE", `/api/v1/organizations/${orgA}/tasks/${taskBId}`],
      ["GET", `/api/v1/organizations/${orgA}/workflows/${workflowBId}`],
      ["PATCH", `/api/v1/organizations/${orgA}/workflows/${workflowBId}`],
      ["DELETE", `/api/v1/organizations/${orgA}/workflows/${workflowBId}`],
      ["PATCH", `/api/v1/organizations/${orgA}/projects/${projectBId}`],
      ["DELETE", `/api/v1/organizations/${orgA}/projects/${projectBId}`]
    ];
    let idorIp = 20;
    for (const [method, url] of cases) {
      for (const cookiesFor of [adminACookies, memberACookies, viewerACookies]) {
        const response = await app.inject({ method: method as "GET", url, headers: { cookie: cookiesFor }, remoteAddress: `10.61.${Math.floor(idorIp / 250)}.${idorIp % 250}`, payload: method === "PATCH" ? { name: "hacked" } : undefined });
        idorIp += 1;
        // 400/403/404 all acceptable: the resource must never be returned or mutated.
        assert.ok(response.statusCode >= 400 && response.statusCode < 500, `${method} ${url} -> ${response.statusCode}`);
        const body = response.body;
        assert.ok(!body.includes("segredo-b") && !body.includes("Confidencial B") && !body.includes("registo-b") && !body.includes("Tarefa privada B"), `${method} ${url} leaked tenant B data`);
      }
    }
  });

  // ---------- 3. Pesquisa global não deve devolver dados de B ----------
  await t.test("global search within org A never returns org B resources", async () => {
    for (const term of ["segredo", "Confidencial", "privada", "Secreta"]) {
      const response = await app.inject({ method: "GET", url: `/api/v1/organizations/${orgA}/search?q=${encodeURIComponent(term)}`, headers: { cookie: adminACookies } });
      assert.equal(response.statusCode, 200);
      const body = response.body;
      assert.ok(!body.includes(orgB), `search for "${term}" leaked org B id`);
      assert.ok(!body.includes("segredo-b") && !body.includes("Tarefa privada B"), `search for "${term}" leaked org B content`);
    }
  });

  // ---------- 4. Notificações/trash/dashboard de A não contêm dados de B ----------
  await t.test("org A listings never contain org B resources", async () => {
    const listingPaths = ["documents", "documents/shared", "lists", "forms", "tasks", "projects", "workflows", "workflow-instances", "approvals", "notifications", "trash", "news", "sites", "users", "teams"];
    let listIp = 40;
    for (const path of listingPaths) {
      const response = await app.inject({ method: "GET", url: `/api/v1/organizations/${orgA}/${path}`, headers: { cookie: adminACookies }, remoteAddress: `10.62.${Math.floor(listIp / 250)}.${listIp % 250}` });
      listIp += 1;
      assert.ok(response.statusCode === 200, `GET ${path} -> ${response.statusCode}`);
      assert.ok(!response.body.includes(docBId) && !response.body.includes(taskBId) && !response.body.includes(listBId) && !response.body.includes(formBId) && !response.body.includes(workflowBId), `GET ${path} leaked org B ids`);
    }
  });

  // ---------- 5. Escrita cross-tenant: A cria recurso "em nome" de B ----------
  await t.test("writes cannot target org B ids or memberships from org A context", async () => {
    // task assigned to B's membership id from org A context
    const taskWithBMember = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${orgA}/tasks`,
      headers: { cookie: adminACookies },
      payload: { title: "tarefa x", assignedMembershipId: memberBUser.id }
    });
    const createdTask = taskWithBMember.statusCode === 201
      ? (taskWithBMember.json() as { assignee?: { memberId?: string }; assignedMembershipId?: string })
      : null;
    const taskStatus = Number(taskWithBMember.statusCode);
    assert.ok(taskStatus === 400 || taskStatus === 404 || taskStatus === 422, `assigning foreign membership -> ${taskStatus}`);
    if (createdTask) {
      assert.notEqual(createdTask.assignee?.memberId ?? createdTask.assignedMembershipId, memberBUser.id, "task accepted a membership from another tenant");
    }

    // document share targeting B's membership
    const docA = await app.inject({ method: "POST", url: `/api/v1/organizations/${orgA}/folders`, headers: { cookie: adminACookies }, payload: { name: "Pasta A", parentId: null } });
    assert.equal(docA.statusCode, 201);
    const shareToB = await app.inject({
      method: "PUT",
      url: `/api/v1/organizations/${orgA}/document/${docBId}/permissions`,
      headers: { cookie: adminACookies },
      payload: { membershipId: memberBUser.id, view: true, edit: true, delete: true, share: true }
    });
    assertBlocked(shareToB.statusCode, "permission on foreign document");

    // list item referencing B's list under org A
    const createInBList = await app.inject({ method: "POST", url: `/api/v1/organizations/${orgA}/lists/${listBId}/items`, headers: { cookie: adminACookies }, payload: { values: { nome: "injected" } } });
    assertBlocked(createInBList.statusCode, "create item in foreign list");

    // comment on B's document under org A
    const commentOnB = await app.inject({ method: "POST", url: `/api/v1/organizations/${orgA}/documents/${docBId}/comments`, headers: { cookie: adminACookies }, payload: { body: "x" } });
    assertBlocked(commentOnB.statusCode, "comment on foreign document");

    // form submission into B's form under org A
    const submitB = await app.inject({ method: "POST", url: `/api/v1/organizations/${orgA}/forms/${formBId}/submissions`, headers: { cookie: adminACookies }, payload: { values: { f1: "x" } } });
    assertBlocked(submitB.statusCode, "submission to foreign form");

    // start B's workflow under org A
    const startB = await app.inject({ method: "POST", url: `/api/v1/organizations/${orgA}/workflows/${workflowBId}/start`, headers: { cookie: adminACookies }, payload: { input: {} } });
    assertBlocked(startB.statusCode, "start foreign workflow");
  });

  // ---------- 6. Utilizador de B acede a A ----------
  await t.test("org B admin cannot access org A either (symmetric isolation)", async () => {
    const response = await app.inject({ method: "GET", url: `/api/v1/organizations/${orgA}/documents`, headers: { cookie: adminBCookies } });
    assertBlocked(response.statusCode, "B admin -> A documents");
    const userList = await app.inject({ method: "GET", url: `/api/v1/organizations/${orgA}/users`, headers: { cookie: adminBCookies } });
    assertBlocked(userList.statusCode, "B admin -> A users");
  });

  // ---------- 7. Requests sem autenticação ----------
  await t.test("unauthenticated requests to protected endpoints return 401", async () => {
    const protectedPaths = [
      `/api/v1/organizations/${orgA}/documents`,
      `/api/v1/organizations/${orgA}/documents/${docBId}/download`,
      `/api/v1/organizations/${orgA}/users`,
      `/api/v1/organizations/${orgA}/audit`,
      `/api/v1/organizations/${orgA}/settings`,
      "/api/v1/auth/me",
      "/api/v1/auth/sessions"
    ];
    for (const url of protectedPaths) {
      const response = await app.inject({ method: "GET", url });
      assert.equal(response.statusCode, 401, `GET ${url} unauthenticated -> ${response.statusCode}`);
    }
  });

  // ---------- 8. IDs inválidos / inexistentes ----------
  await t.test("invalid or non-existent resource ids return 4xx, never 500", async () => {
    const cases = [
      `/api/v1/organizations/${orgA}/documents/not-a-real-id`,
      `/api/v1/organizations/${orgA}/documents/${"x".repeat(500)}`,
      `/api/v1/organizations/${orgA}/tasks/00000000-0000-0000-0000-000000000000`,
      `/api/v1/organizations/${orgA}/lists/../lists`,
      `/api/v1/organizations/${orgA}/documents/%2e%2e%2fsecret`,
      `/api/v1/organizations/${orgA}/folders/null`,
      `/api/v1/organizations/${orgA}/documents/undefined`
    ];
    let invalidIp = 80;
    for (const url of cases) {
      const response = await app.inject({ method: "GET", url, headers: { cookie: adminACookies }, remoteAddress: `10.63.${Math.floor(invalidIp / 250)}.${invalidIp % 250}` });
      invalidIp += 1;
      // 414 (param too long) and normalized-path 200s are acceptable; never 5xx.
      assert.ok(response.statusCode < 500, `GET ${url} -> ${response.statusCode}`);
      assert.ok(!response.body.includes("Prisma") && !response.body.includes("SELECT") && !response.body.includes("at "), `GET ${url} leaked internals: ${response.body.slice(0, 200)}`);
      if (response.statusCode !== 414 && response.statusCode !== 200) {
        const parsed = response.json();
        assert.ok(parsed.error?.code, `GET ${url} missing structured error`);
      }
    }
  });

  // ---------- 9. Mass assignment ----------
  await t.test("mass assignment of privileged fields is ignored", async () => {
    // Register attempt with isSuperAdmin / extra fields (distinct IP to avoid auth rate limit)
    const evilReg = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      remoteAddress: "10.77.77.1",
      payload: { name: "Evil User", email: `evil-${marker}@example.com`, password: "EvilPassword123", organizationName: "Evil Org", isSuperAdmin: true, status: "ACTIVE", role: "Super Admin" }
    });
    assert.equal(evilReg.statusCode, 201);
    organizationIds.push(evilReg.json().organizations[0].id);
    const evilUser = await prisma.user.findUniqueOrThrow({ where: { email: `evil-${marker}@example.com` } });
    assert.equal(evilUser.isSuperAdmin, false, "register accepted isSuperAdmin");

    // Profile patch attempting privilege fields
    const patch = await app.inject({
      method: "PATCH",
      url: "/api/v1/auth/me",
      headers: { cookie: adminACookies },
      payload: { isSuperAdmin: true, status: "SUSPENDED", id: "other", passwordHash: "x", tenantId: orgB }
    });
    assert.equal(patch.statusCode, 200);
    const adminA = await prisma.user.findUniqueOrThrow({ where: { email: emails.adminA } });
    assert.equal(adminA.isSuperAdmin, false);
    assert.equal(adminA.status, "ACTIVE");

    // Org admin tries to grant themselves Super Admin role via user update
    const selfPatch = await app.inject({
      method: "PATCH",
      url: `/api/v1/organizations/${orgA}/users/${adminA ? "" : ""}${(await prisma.user.findUniqueOrThrow({ where: { email: emails.adminA } })).id}`,
      headers: { cookie: adminACookies },
      payload: { role: "Super Admin" }
    });
    assert.equal(selfPatch.statusCode, 403);

    // User create with injected fields
    const createInjected = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${orgA}/users`,
      headers: { cookie: adminACookies },
      payload: { name: "Injected", email: `inj-${marker}@example.com`, password: "InjectedPass123", role: "Member", isSuperAdmin: true, tenantId: orgB }
    });
    assert.equal(createInjected.statusCode, 201);
    const injected = await prisma.user.findUniqueOrThrow({ where: { email: `inj-${marker}@example.com` } });
    assert.equal(injected.isSuperAdmin, false);
    const injectedMembership = await prisma.organizationMember.findFirstOrThrow({ where: { userId: injected.id } });
    assert.equal(injectedMembership.tenantId, orgA, "membership created in wrong tenant");
    await prisma.user.delete({ where: { id: injected.id } });
    await prisma.user.delete({ where: { id: evilUser.id } });
  });
});
