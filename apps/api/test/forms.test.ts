import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `forms-admin-${marker}@example.com`;
const viewerEmail = `forms-viewer-${marker}@example.com`;
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

test("forms support creation, fields, publishing, submissions, validation, duplication and export", async () => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Form Admin", email: adminEmail, password: "FormsPassword123", organizationName: "Forms Organization" } });
  assert.equal(registration.statusCode, 201);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  const addViewer = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Form Viewer", email: viewerEmail, password: "FormsPassword123", role: "Viewer" } });
  assert.equal(addViewer.statusCode, 201, addViewer.body);

  // --- Create a form with fields ---
  const createForm = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/forms`,
    headers: { cookie: adminCookies },
    payload: {
      name: "Contacto",
      description: "Formulário de contacto",
      fields: [
        { id: "f1", type: "heading", label: "Dados pessoais", required: false, order: 0 },
        { id: "f2", type: "text", label: "Nome", required: true, placeholder: "O seu nome", order: 1 },
        { id: "f3", type: "email", label: "Email", required: true, order: 2 },
        { id: "f4", type: "phone", label: "Telefone", required: false, order: 3 },
        { id: "f5", type: "separator", label: "Separador", required: false, order: 4 },
        { id: "f6", type: "select", label: "Assunto", required: true, options: [{ value: "info", label: "Informação" }, { value: "support", label: "Suporte" }], order: 5 },
        { id: "f7", type: "longtext", label: "Mensagem", required: true, order: 6 },
        { id: "f8", type: "checkbox", label: "Preferências", required: false, options: [{ value: "newsletter", label: "Newsletter" }, { value: "promo", label: "Promoções" }], order: 7 },
        { id: "f9", type: "number", label: "Idade", required: false, order: 8 },
        { id: "f10", type: "currency", label: "Orçamento", required: false, defaultValue: 0, order: 9 },
        { id: "f11", type: "date", label: "Data preferida", required: false, order: 10 }
      ]
    }
  });
  assert.equal(createForm.statusCode, 201, createForm.body);
  const form = createForm.json();
  assert.equal(form.name, "Contacto");
  assert.equal(form.status, "DRAFT");
  assert.equal(form.fields.length, 11);

  // --- Get the form ---
  const getForm = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/forms/${form.id}`, headers: { cookie: adminCookies } });
  assert.equal(getForm.statusCode, 200);
  assert.equal(getForm.json().id, form.id);

  // --- List forms ---
  const listForms = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/forms`, headers: { cookie: adminCookies } });
  assert.equal(listForms.statusCode, 200);
  assert.ok(listForms.json().forms.length >= 1);

  // --- Cannot submit to a DRAFT form ---
  const submitDraft = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/forms/${form.id}/submissions`,
    headers: { cookie: adminCookies },
    payload: { values: { f2: "Test", f3: "test@example.com", f6: "info", f7: "Msg" } }
  });
  assert.equal(submitDraft.statusCode, 403);

  // --- Cannot publish a form without input fields (should pass since we have input fields) ---
  const publish = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/forms/${form.id}`, headers: { cookie: adminCookies }, payload: { status: "PUBLISHED" } });
  assert.equal(publish.statusCode, 200, publish.body);
  assert.equal(publish.json().status, "PUBLISHED");

  // --- Submit a valid response ---
  const submitValid = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/forms/${form.id}/submissions`,
    headers: { cookie: adminCookies },
    payload: { values: { f2: "João Silva", f3: "joao@example.com", f4: "+351912345678", f6: "info", f7: "Preciso de informações.", f8: ["newsletter"], f9: 30, f10: 500.5, f11: "2026-01-15" } }
  });
  assert.equal(submitValid.statusCode, 201, submitValid.body);
  assert.equal(submitValid.json().values.f2, "João Silva");
  assert.equal(submitValid.json().values.f9, 30);

  // --- Reject missing required field ---
  const submitMissing = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/forms/${form.id}/submissions`,
    headers: { cookie: adminCookies },
    payload: { values: { f3: "test@example.com", f6: "info", f7: "Msg" } }
  });
  assert.equal(submitMissing.statusCode, 400);

  // --- Reject invalid email ---
  const submitBadEmail = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/forms/${form.id}/submissions`,
    headers: { cookie: adminCookies },
    payload: { values: { f2: "Test", f3: "not-an-email", f6: "info", f7: "Msg" } }
  });
  assert.equal(submitBadEmail.statusCode, 400);

  // --- Reject invalid phone ---
  const submitBadPhone = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/forms/${form.id}/submissions`,
    headers: { cookie: adminCookies },
    payload: { values: { f2: "Test", f3: "test@example.com", f4: "abc", f6: "info", f7: "Msg" } }
  });
  assert.equal(submitBadPhone.statusCode, 400);

  // --- Reject invalid select option ---
  const submitBadSelect = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/forms/${form.id}/submissions`,
    headers: { cookie: adminCookies },
    payload: { values: { f2: "Test", f3: "test@example.com", f6: "unknown", f7: "Msg" } }
  });
  assert.equal(submitBadSelect.statusCode, 400);

  // --- Reject unknown field ---
  const submitUnknown = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/forms/${form.id}/submissions`,
    headers: { cookie: adminCookies },
    payload: { values: { f2: "Test", f3: "test@example.com", f6: "info", f7: "Msg", extra: "bad" } }
  });
  assert.equal(submitUnknown.statusCode, 400);

  // --- Submit a second response ---
  const submit2 = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/forms/${form.id}/submissions`,
    headers: { cookie: adminCookies },
    payload: { values: { f2: "Maria", f3: "maria@example.com", f6: "support", f7: "Preciso de suporte." } }
  });
  assert.equal(submit2.statusCode, 201);

  // --- List submissions ---
  const submissions = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/forms/${form.id}/submissions?page=1&pageSize=10`, headers: { cookie: adminCookies } });
  assert.equal(submissions.statusCode, 200);
  assert.equal(submissions.json().total, 2);
  assert.equal(submissions.json().submissions.length, 2);

  // --- Export CSV ---
  const exportCsv = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/forms/${form.id}/submissions/export.csv`, headers: { cookie: adminCookies } });
  assert.equal(exportCsv.statusCode, 200);
  assert.ok(exportCsv.headers["content-type"]?.includes("text/csv"));
  assert.ok(exportCsv.body.includes("Nome"));
  assert.ok(exportCsv.body.includes("João Silva"));

  // --- Update form (add a field) ---
  const updateForm = await app.inject({
    method: "PATCH",
    url: `/api/v1/organizations/${organizationId}/forms/${form.id}`,
    headers: { cookie: adminCookies },
    payload: {
      name: "Contacto Premium",
      fields: [
        ...form.fields.map((f: { id: string; type: string; label: string; required: boolean; options: unknown; order: number }) => ({ id: f.id, type: f.type, label: f.label, required: f.required, options: f.options as object, order: f.order })),
        { id: "f12", type: "radio", label: "Urgência", required: false, options: [{ value: "normal", label: "Normal" }, { value: "alta", label: "Alta" }], order: 11 }
      ]
    }
  });
  assert.equal(updateForm.statusCode, 200, updateForm.body);
  assert.equal(updateForm.json().name, "Contacto Premium");
  assert.equal(updateForm.json().fields.length, 12);

  // --- Duplicate the form ---
  const duplicate = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/forms/${form.id}/duplicate`, headers: { cookie: adminCookies } });
  assert.equal(duplicate.statusCode, 201);
  assert.equal(duplicate.json().name, "Contacto Premium (cópia)");
  assert.equal(duplicate.json().status, "DRAFT");
  assert.equal(duplicate.json().fields.length, 12);
  assert.equal(duplicate.json().submissionCount, 0);

  // --- Archive the form ---
  const archive = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/forms/${form.id}`, headers: { cookie: adminCookies }, payload: { status: "ARCHIVED" } });
  assert.equal(archive.statusCode, 200);
  assert.equal(archive.json().status, "ARCHIVED");

  // --- Cannot submit to an archived form ---
  const submitArchived = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/forms/${form.id}/submissions`,
    headers: { cookie: adminCookies },
    payload: { values: { f2: "Test", f3: "test@example.com", f6: "info", f7: "Msg" } }
  });
  assert.equal(submitArchived.statusCode, 403);

  // --- Viewer cannot manage forms ---
  const viewerLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: viewerEmail, password: "FormsPassword123" } });
  assert.equal(viewerLogin.statusCode, 200);
  const viewerCookies = cookies(viewerLogin);
  const viewerCreate = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/forms`, headers: { cookie: viewerCookies }, payload: { name: "Forbidden", fields: [] } });
  assert.equal(viewerCreate.statusCode, 403);

  // --- Viewer can view forms ---
  const viewerList = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/forms`, headers: { cookie: viewerCookies } });
  assert.equal(viewerList.statusCode, 200);

  // --- Cannot publish a form with only layout fields ---
  const layoutOnly = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/forms`,
    headers: { cookie: adminCookies },
    payload: { name: "Layout Only", fields: [{ id: "l1", type: "heading", label: "Title", required: false, order: 0 }] }
  });
  assert.equal(layoutOnly.statusCode, 201);
  const publishLayout = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/forms/${layoutOnly.json().id}`, headers: { cookie: adminCookies }, payload: { status: "PUBLISHED" } });
  assert.equal(publishLayout.statusCode, 400);

  // --- Delete the form ---
  const deleteForm = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/forms/${form.id}`, headers: { cookie: adminCookies } });
  assert.equal(deleteForm.statusCode, 204);
  const deletedGet = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/forms/${form.id}`, headers: { cookie: adminCookies } });
  assert.equal(deletedGet.statusCode, 404);

  // --- Audit log was created ---
  const audit = await prisma.auditLog.findFirst({ where: { tenantId: organizationId, resourceId: form.id, action: "form.deleted" } });
  assert.ok(audit);

  // Clean up
  await prisma.formDefinition.deleteMany({ where: { tenantId: organizationId, id: { in: [duplicate.json().id, layoutOnly.json().id] } } });
});
