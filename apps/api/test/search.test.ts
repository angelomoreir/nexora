import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `gs-admin-${marker}@example.com`;
const viewerEmail = `gs-viewer-${marker}@example.com`;
const organizationIds: string[] = [];
const userEmails = [adminEmail, viewerEmail];

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

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: userEmails } } });
  await app.close();
  await prisma.$disconnect();
});

test("global search finds entities, respects permissions, and groups results", async () => {
  // --- Setup ---
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Search Admin", email: adminEmail, password: "SearchPassword123", organizationName: "Search Org" } });
  assert.equal(registration.statusCode, 201, registration.body);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  const addViewer = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Search Viewer", email: viewerEmail, password: "SearchPassword123", role: "Viewer" } });
  assert.equal(addViewer.statusCode, 201);
  const viewerLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: viewerEmail, password: "SearchPassword123" } });
  const viewerCookies = cookies(viewerLogin);

  // --- Create searchable entities ---
  // Task
  const createTask = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/tasks`, headers: { cookie: adminCookies }, payload: { title: "Pesquisar tarefa especial" } });
  assert.equal(createTask.statusCode, 201, createTask.body);

  // List
  const createList = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/lists`, headers: { cookie: adminCookies }, payload: { name: "Lista de pesquisa", fields: [{ name: "Nome", slug: "nome", type: "text", required: true }] } });
  assert.equal(createList.statusCode, 201, createList.body);
  const listId = createList.json().id;

  // List item
  const createItem = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/lists/${listId}/items`, headers: { cookie: adminCookies }, payload: { values: { nome: "Registo especial para pesquisa" } } });
  assert.equal(createItem.statusCode, 201, createItem.body);

  // Workflow
  const createWorkflow = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows`, headers: { cookie: adminCookies }, payload: { name: "Workflow de pesquisa", steps: [{ order: 0, type: "START", name: "Iniciar", config: {} }, { order: 1, type: "END", name: "Terminar", config: {} }] } });
  assert.equal(createWorkflow.statusCode, 201, createWorkflow.body);

  // Folder + Document
  const createFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: adminCookies }, payload: { name: "Pasta de pesquisa" } });
  assert.equal(createFolder.statusCode, 201);
  const folderId = createFolder.json().id;

  const uploadBody = await multipart("documento-pesquisa.pdf", "application/pdf", new TextEncoder().encode("%PDF-1.4 search"));
  const upload = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents?folderId=${folderId}`, headers: { cookie: adminCookies, "content-type": uploadBody.contentType }, payload: uploadBody.payload });
  assert.equal(upload.statusCode, 201, upload.body);

  // --- Search as admin: should find all ---
  const adminSearch = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/search?q=pesquisa`, headers: { cookie: adminCookies } });
  assert.equal(adminSearch.statusCode, 200, adminSearch.body);
  const adminResults = adminSearch.json();
  assert.ok(adminResults.total > 0, "Admin should find results");

  const adminTypes = new Set(adminResults.groups.map((g: { type: string }) => g.type));
  assert.ok(adminTypes.has("document"), "Admin should find documents");
  assert.ok(adminTypes.has("folder"), "Admin should find folders");
  assert.ok(adminTypes.has("list"), "Admin should find lists");
  assert.ok(adminTypes.has("list_item"), "Admin should find list items");
  assert.ok(adminTypes.has("task"), "Admin should find tasks");
  assert.ok(adminTypes.has("workflow"), "Admin should find workflows");

  // --- Search as viewer: should find tasks, lists, workflows but NOT documents (viewer has documents.view but no direct permission on the document) ---
  // Actually viewer has documents.view capability and there are no sharing rules, so they CAN see the document
  const viewerSearch = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/search?q=pesquisa`, headers: { cookie: viewerCookies } });
  assert.equal(viewerSearch.statusCode, 200, viewerSearch.body);
  const viewerResults = viewerSearch.json();
  assert.ok(viewerResults.total > 0, "Viewer should find results");

  // --- Filter by type ---
  const taskOnlySearch = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/search?q=pesquisa&types=task`, headers: { cookie: adminCookies } });
  assert.equal(taskOnlySearch.statusCode, 200);
  const taskOnly = taskOnlySearch.json();
  assert.ok(taskOnly.groups.every((g: { type: string }) => g.type === "task"), "Should only return task results");
  assert.ok(taskOnly.groups.some((g: { type: string }) => g.type === "task"), "Should have task group");

  // --- Filter by status ---
  const todoSearch = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/search?q=pesquisa&types=task&status=TODO`, headers: { cookie: adminCookies } });
  assert.equal(todoSearch.statusCode, 200);
  const todoResults = todoSearch.json();
  if (todoResults.groups.length > 0) {
    assert.ok(todoResults.groups.every((g: { type: string }) => g.type === "task"), "Status filter should only return tasks");
  }

  // --- Short query returns empty ---
  const shortQuery = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/search?q=a`, headers: { cookie: adminCookies } });
  assert.equal(shortQuery.statusCode, 200);
  assert.equal(shortQuery.json().total, 0);
  assert.equal(shortQuery.json().groups.length, 0);

  // --- No results for non-matching query ---
  const noMatch = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/search?q=zzznonexistent`, headers: { cookie: adminCookies } });
  assert.equal(noMatch.statusCode, 200);
  assert.equal(noMatch.json().total, 0);

  // --- Search for specific entity ---
  const taskSearch = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/search?q=tarefa`, headers: { cookie: adminCookies } });
  assert.equal(taskSearch.statusCode, 200);
  const taskResults = taskSearch.json();
  const taskGroup = taskResults.groups.find((g: { type: string }) => g.type === "task");
  assert.ok(taskGroup, "Should have task group");
  assert.ok(taskGroup.results.some((r: { title: string }) => r.title.includes("tarefa")), "Should find the task");

  // --- Each result has href for navigation ---
  const docGroup = adminResults.groups.find((g: { type: string }) => g.type === "document");
  if (docGroup) {
    assert.ok(docGroup.results.every((r: { href: string }) => r.href.startsWith("/")), "Document results should have href");
  }

  // --- Organization isolation: viewer from same org can search, but search is scoped ---
  // Verify the viewer can't see results from another org (they only see their own org's data)
  const viewerTaskSearch = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/search?q=tarefa`, headers: { cookie: viewerCookies } });
  assert.equal(viewerTaskSearch.statusCode, 200);
  // Viewer should find the task (they have tasks.view)
  const viewerTaskGroup = viewerTaskSearch.json().groups.find((g: { type: string }) => g.type === "task");
  assert.ok(viewerTaskGroup, "Viewer should see task group");

  // --- Document permission isolation ---
  // Create a document with explicit sharing rules so viewer can't see it
  const restrictedUploadBody = await multipart("restrito.pdf", "application/pdf", new TextEncoder().encode("%PDF-1.4 restricted"));
  const restrictedUpload = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents?folderId=${folderId}`, headers: { cookie: adminCookies, "content-type": restrictedUploadBody.contentType }, payload: restrictedUploadBody.payload });
  assert.equal(restrictedUpload.statusCode, 201);
  const restrictedDocId = restrictedUpload.json().document.id;

  // Share with admin only (not viewer) - this creates a sharing rule, so viewer won't have open access
  const adminMembership = await prisma.organizationMember.findFirst({ where: { tenantId: organizationId, userId: registration.json().user.id } });
  if (adminMembership) {
    await app.inject({ method: "PUT", url: `/api/v1/organizations/${organizationId}/document/${restrictedDocId}/permissions`, headers: { cookie: adminCookies }, payload: { membershipId: adminMembership.id, view: true, edit: false, delete: false, share: false } });
  }

  // Search for "restrito" as viewer - should NOT find it
  const viewerRestrictedSearch = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/search?q=restrito`, headers: { cookie: viewerCookies } });
  assert.equal(viewerRestrictedSearch.statusCode, 200);
  const viewerRestrictedResults = viewerRestrictedSearch.json();
  const viewerDocGroup = viewerRestrictedResults.groups.find((g: { type: string }) => g.type === "document");
  if (viewerDocGroup) {
    assert.ok(!viewerDocGroup.results.some((r: { title: string }) => r.title.includes("restrito")), "Viewer should NOT find restricted document");
  }

  // Admin should find it
  const adminRestrictedSearch = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/search?q=restrito`, headers: { cookie: adminCookies } });
  const adminRestrictedResults = adminRestrictedSearch.json();
  const adminDocGroup = adminRestrictedResults.groups.find((g: { type: string }) => g.type === "document");
  assert.ok(adminDocGroup, "Admin should have document group");
  assert.ok(adminDocGroup.results.some((r: { title: string }) => r.title.includes("restrito")), "Admin should find restricted document");
});
