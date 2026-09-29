import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `lists-admin-${marker}@example.com`;
const viewerEmail = `lists-viewer-${marker}@example.com`;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, viewerEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("lists support creation, fields, records, validation, duplication, export and permissions", async () => {
  // Register an organization owner (Super Admin role by default).
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "List Admin", email: adminEmail, password: "ListsPassword123", organizationName: "Lists Organization" } });
  assert.equal(registration.statusCode, 201);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  // Create a viewer member with only lists.view permission.
  const addViewer = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "List Viewer", email: viewerEmail, password: "ListsPassword123", role: "Viewer" } });
  assert.equal(addViewer.statusCode, 201, addViewer.body);

  // --- Create a list with fields ---
  const createList = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/lists`,
    headers: { cookie: adminCookies },
    payload: {
      name: "Clientes",
      description: "Lista de clientes",
      fields: [
        { name: "Nome", slug: "nome", type: "text", required: true, order: 0 },
        { name: "NIF", slug: "nif", type: "text", required: true, order: 1 },
        { name: "Email", slug: "email", type: "email", required: false, order: 2 },
        { name: "Estado", slug: "estado", type: "choice", required: false, options: [{ value: "ativo", label: "Ativo" }, { value: "inativo", label: "Inativo" }], order: 3 },
        { name: "Saldo", slug: "saldo", type: "currency", required: false, order: 4 }
      ]
    }
  });
  assert.equal(createList.statusCode, 201, createList.body);
  const list = createList.json();
  assert.equal(list.name, "Clientes");
  assert.equal(list.fields.length, 5);
  assert.equal(list.fields[0].name, "Nome");
  assert.equal(list.fields[3].options.length, 2);

  // --- Fetch the list ---
  const getList = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/lists/${list.id}`, headers: { cookie: adminCookies } });
  assert.equal(getList.statusCode, 200);
  assert.equal(getList.json().id, list.id);

  // --- List all lists ---
  const listAll = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/lists`, headers: { cookie: adminCookies } });
  assert.equal(listAll.statusCode, 200);
  assert.ok(listAll.json().lists.length >= 1);

  // --- Create a valid record ---
  const createItem = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/lists/${list.id}/items`,
    headers: { cookie: adminCookies },
    payload: { values: { nome: "Acme Lda", nif: "500000000", email: "acme@example.com", estado: "ativo", saldo: 1250.5 } }
  });
  assert.equal(createItem.statusCode, 201, createItem.body);
  const item = createItem.json();
  assert.equal(item.values.nome, "Acme Lda");
  assert.equal(item.values.saldo, 1250.5);

  // --- Reject invalid email ---
  const badEmail = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/lists/${list.id}/items`,
    headers: { cookie: adminCookies },
    payload: { values: { nome: "Bad", nif: "123", email: "not-an-email" } }
  });
  assert.equal(badEmail.statusCode, 400);

  // --- Reject missing required field ---
  const missingRequired = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/lists/${list.id}/items`,
    headers: { cookie: adminCookies },
    payload: { values: { nome: "No NIF" } }
  });
  assert.equal(missingRequired.statusCode, 400);

  // --- Reject invalid choice ---
  const badChoice = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/lists/${list.id}/items`,
    headers: { cookie: adminCookies },
    payload: { values: { nome: "Choice", nif: "999", estado: "unknown" } }
  });
  assert.equal(badChoice.statusCode, 400);

  // --- Reject unknown field ---
  const unknownField = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/lists/${list.id}/items`,
    headers: { cookie: adminCookies },
    payload: { values: { nome: "X", nif: "Y", extra: "bad" } }
  });
  assert.equal(unknownField.statusCode, 400);

  // --- Create a second record ---
  const createItem2 = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/lists/${list.id}/items`,
    headers: { cookie: adminCookies },
    payload: { values: { nome: "Beta Corp", nif: "500000001", estado: "inativo", saldo: 500 } }
  });
  assert.equal(createItem2.statusCode, 201);

  // --- List items with pagination ---
  const itemsPage = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/lists/${list.id}/items?page=1&pageSize=10`, headers: { cookie: adminCookies } });
  assert.equal(itemsPage.statusCode, 200);
  assert.equal(itemsPage.json().total, 2);
  assert.equal(itemsPage.json().items.length, 2);

  // --- Sort by field ---
  const sorted = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/lists/${list.id}/items?sort=nome&order=asc`, headers: { cookie: adminCookies } });
  assert.equal(sorted.statusCode, 200);
  assert.equal(sorted.json().items[0].values.nome, "Acme Lda");

  // --- Update a record ---
  const updateItem = await app.inject({
    method: "PATCH",
    url: `/api/v1/organizations/${organizationId}/lists/${list.id}/items/${item.id}`,
    headers: { cookie: adminCookies },
    payload: { values: { nome: "Acme Lda Updated", nif: "500000000", email: "acme@example.com", estado: "ativo", saldo: 2000 } }
  });
  assert.equal(updateItem.statusCode, 200);
  assert.equal(updateItem.json().values.nome, "Acme Lda Updated");
  assert.equal(updateItem.json().values.saldo, 2000);

  // --- Batch delete ---
  const batchDelete = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/lists/${list.id}/items/delete-batch`,
    headers: { cookie: adminCookies },
    payload: { itemIds: [createItem2.json().id] }
  });
  assert.equal(batchDelete.statusCode, 204);
  const afterBatch = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/lists/${list.id}/items`, headers: { cookie: adminCookies } });
  assert.equal(afterBatch.json().total, 1);

  // --- Duplicate the list ---
  const duplicate = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/lists/${list.id}/duplicate`, headers: { cookie: adminCookies } });
  assert.equal(duplicate.statusCode, 201);
  assert.equal(duplicate.json().name, "Clientes (cópia)");
  assert.equal(duplicate.json().fields.length, 5);
  assert.equal(duplicate.json().itemCount, 0);

  // --- Export CSV ---
  const exportCsv = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/lists/${list.id}/export.csv`, headers: { cookie: adminCookies } });
  assert.equal(exportCsv.statusCode, 200);
  assert.ok(exportCsv.headers["content-type"]?.includes("text/csv"));
  assert.ok(exportCsv.body.includes("Nome"));
  assert.ok(exportCsv.body.includes("Acme Lda Updated"));

  // --- Update list (add a field) ---
  const updateList = await app.inject({
    method: "PATCH",
    url: `/api/v1/organizations/${organizationId}/lists/${list.id}`,
    headers: { cookie: adminCookies },
    payload: {
      name: "Clientes Premium",
      fields: [
        { name: "Nome", slug: "nome", type: "text", required: true, order: 0 },
        { name: "NIF", slug: "nif", type: "text", required: true, order: 1 },
        { name: "Email", slug: "email", type: "email", required: false, order: 2 },
        { name: "Estado", slug: "estado", type: "choice", required: false, options: [{ value: "ativo", label: "Ativo" }, { value: "inativo", label: "Inativo" }, { value: "suspenso", label: "Suspenso" }], order: 3 },
        { name: "Telefone", slug: "telefone", type: "text", required: false, order: 4 }
      ]
    }
  });
  assert.equal(updateList.statusCode, 200, updateList.body);
  assert.equal(updateList.json().name, "Clientes Premium");
  assert.equal(updateList.json().fields.length, 5);
  assert.equal(updateList.json().fields[4].slug, "telefone");

  // --- Viewer cannot create lists (no lists.manage) ---
  const viewerLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: viewerEmail, password: "ListsPassword123" } });
  assert.equal(viewerLogin.statusCode, 200);
  const viewerCookies = cookies(viewerLogin);
  const viewerCreate = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/lists`, headers: { cookie: viewerCookies }, payload: { name: "Forbidden", fields: [] } });
  assert.equal(viewerCreate.statusCode, 403);

  // --- Viewer can view lists ---
  const viewerList = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/lists`, headers: { cookie: viewerCookies } });
  assert.equal(viewerList.statusCode, 200);

  // --- Delete the list ---
  const deleteList = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/lists/${list.id}`, headers: { cookie: adminCookies } });
  assert.equal(deleteList.statusCode, 204);
  const deletedGet = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/lists/${list.id}`, headers: { cookie: adminCookies } });
  assert.equal(deletedGet.statusCode, 404);

  // --- Audit log was created ---
  const audit = await prisma.auditLog.findFirst({ where: { tenantId: organizationId, resourceId: list.id, action: "list.deleted" } });
  assert.ok(audit);

  // Clean up the duplicate list
  await prisma.listDefinition.deleteMany({ where: { tenantId: organizationId, id: duplicate.json().id } });
});
