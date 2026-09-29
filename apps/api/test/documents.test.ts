import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { storage } from "../src/services/storage/index.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `documents-admin-${marker}@example.com`;
const viewerEmail = `documents-viewer-${marker}@example.com`;
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

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, viewerEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("documents support real upload, secure download, permissions and physical deletion", async () => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Document Admin", email: adminEmail, password: "DocumentsPassword123", organizationName: "Documents Organization" } });
  assert.equal(registration.statusCode, 201);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  const initial = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents`, headers: { cookie: adminCookies } });
  assert.equal(initial.statusCode, 200);
  const documentsRoot = initial.json().folders.find((folder: { name: string }) => folder.name === "Documentos");
  assert.ok(documentsRoot);

  const createFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: adminCookies }, payload: { name: "Testes", parentId: documentsRoot.id } });
  assert.equal(createFolder.statusCode, 201);
  const folderId = createFolder.json().id as string;

  const uploadBody = await multipart("relatório.pdf", "application/pdf", new TextEncoder().encode("%PDF-1.4 nexora"));
  const upload = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents?folderId=${folderId}`, headers: { cookie: adminCookies, "content-type": uploadBody.contentType }, payload: uploadBody.payload });
  assert.equal(upload.statusCode, 201, upload.body);
  const document = upload.json().document;
  assert.equal(document.name, "relatório.pdf");
  assert.equal(document.extension, "pdf");
  assert.equal(document.mimeType, "application/pdf");
  assert.equal("storageKey" in document, false);

  const stored = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });
  assert.ok(stored.storageKey);
  assert.equal(await storage.exists(stored.storageKey!), true);

  const list = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents?folderId=${folderId}&search=relat&sort=size&order=desc`, headers: { cookie: adminCookies } });
  assert.equal(list.statusCode, 200);
  assert.deepEqual(list.json().documents.map((item: { id: string }) => item.id), [document.id]);

  const download = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/download`, headers: { cookie: adminCookies } });
  assert.equal(download.statusCode, 200);
  assert.equal(download.headers["content-type"], "application/pdf");
  assert.equal(download.rawPayload.toString(), "%PDF-1.4 nexora");

  const createViewer = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Document Viewer", email: viewerEmail, password: "ViewerPassword123", role: "Viewer" } });
  assert.equal(createViewer.statusCode, 201);
  const viewerMembershipId = createViewer.json().memberId as string;
  const share = await app.inject({ method: "PUT", url: `/api/v1/organizations/${organizationId}/document/${document.id}/permissions`, headers: { cookie: adminCookies }, payload: { membershipId: viewerMembershipId, view: true, edit: false, delete: false, share: false } });
  assert.equal(share.statusCode, 204);

  const viewerLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: viewerEmail, password: "ViewerPassword123" } });
  assert.equal(viewerLogin.statusCode, 200);
  const viewerCookies = cookies(viewerLogin);
  const viewerDownload = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/download`, headers: { cookie: viewerCookies } });
  assert.equal(viewerDownload.statusCode, 200);
  const viewerDelete = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/documents/${document.id}`, headers: { cookie: viewerCookies } });
  assert.equal(viewerDelete.statusCode, 403);

  const invalidBody = await multipart("malware.exe", "application/octet-stream", new TextEncoder().encode("blocked"));
  const invalidUpload = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents`, headers: { cookie: adminCookies, "content-type": invalidBody.contentType }, payload: invalidBody.payload });
  assert.equal(invalidUpload.statusCode, 415);

  const remove = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/documents/${document.id}`, headers: { cookie: adminCookies } });
  assert.equal(remove.statusCode, 204);
  assert.equal((await prisma.document.findUnique({ where: { id: document.id } }))!.status, "DELETED");
  assert.equal(await storage.exists(stored.storageKey!), true);
  const removedDownload = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/download`, headers: { cookie: adminCookies } });
  assert.equal(removedDownload.statusCode, 404);
  const purge = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/trash/document/${document.id}`, headers: { cookie: adminCookies } });
  assert.equal(purge.statusCode, 204);
  assert.equal(await prisma.document.findUnique({ where: { id: document.id } }), null);
  assert.equal(await storage.exists(stored.storageKey!), false);
});
