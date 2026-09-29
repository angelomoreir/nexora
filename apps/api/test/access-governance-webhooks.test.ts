import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `access-admin-${marker}@example.com`;
const memberEmail = `access-member-${marker}@example.com`;
const organizationIds: string[] = [];

let organizationId = "";
let adminCookies = "";
let memberCookies = "";
let adminMembershipId = "";
let memberMembershipId = "";

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

async function uploadText(cookie: string, name: string, content: string, folderId?: string) {
  const body = await multipart(name, "text/plain", new TextEncoder().encode(content));
  const response = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents${folderId ? `?folderId=${folderId}` : ""}`, headers: { cookie, "content-type": body.contentType }, payload: body.payload });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().document;
}

async function rootFolderId() {
  const listing = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents`, headers: { cookie: adminCookies } });
  assert.equal(listing.statusCode, 200);
  return listing.json().folders.find((folder: { name: string }) => folder.name === "Documentos").id as string;
}

async function waitFor(condition: () => Promise<boolean>, attempts = 50) {
  for (let index = 0; index < attempts; index += 1) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(await condition(), "condition was not met in time");
}

before(async () => {
  await app.ready();
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Access Admin", email: adminEmail, password: "AccessPassword123", organizationName: "Access Organization" } });
  assert.equal(registration.statusCode, 201);
  organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  adminCookies = cookies(registration);
  adminMembershipId = (await prisma.organizationMember.findFirstOrThrow({ where: { tenantId: organizationId, user: { email: adminEmail } } })).id;

  const createMember = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Access Member", email: memberEmail, password: "MemberPassword123", role: "Member" } });
  assert.equal(createMember.statusCode, 201, createMember.body);
  memberMembershipId = createMember.json().memberId as string;
  const memberLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: memberEmail, password: "MemberPassword123" } });
  assert.equal(memberLogin.statusCode, 200);
  memberCookies = cookies(memberLogin);
});

after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, memberEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("request access flow: request -> approve -> permission granted -> requester can view", async () => {
  const document = await uploadText(adminCookies, `restricted-${marker}.txt`, "restricted content");

  // Break inheritance so non-owners without explicit grants are denied.
  const inherit = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/access/document/${document.id}/inherit`, headers: { cookie: adminCookies }, payload: { inherit: false } });
  assert.equal(inherit.statusCode, 200, inherit.body);
  assert.equal(inherit.json().inheritsPermissions, false);

  const denied = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/${document.id}`, headers: { cookie: memberCookies } });
  assert.equal(denied.statusCode, 403);

  const requested = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/access-requests`, headers: { cookie: memberCookies }, payload: { resourceType: "document", resourceId: document.id, message: "Preciso de ler este documento" } });
  assert.equal(requested.statusCode, 201, requested.body);
  assert.equal(requested.json().status, "PENDING");

  // Duplicate pending request is rejected.
  const duplicate = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/access-requests`, headers: { cookie: memberCookies }, payload: { resourceType: "document", resourceId: document.id } });
  assert.equal(duplicate.statusCode, 409);

  // The owner was notified.
  const ownerNotification = await prisma.notification.findFirst({ where: { tenantId: organizationId, recipientId: adminMembershipId, type: "access.requested" } });
  assert.ok(ownerNotification);

  const list = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/access-requests?status=PENDING`, headers: { cookie: adminCookies } });
  assert.equal(list.statusCode, 200);
  const pending = list.json().requests.find((r: { id: string }) => r.id === requested.json().id);
  assert.ok(pending);
  assert.equal(pending.resourceName, document.name);

  const decided = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/access-requests/${requested.json().id}/decide`, headers: { cookie: adminCookies }, payload: { approve: true, access: "view" } });
  assert.equal(decided.statusCode, 200, decided.body);
  assert.equal(decided.json().status, "APPROVED");

  const grant = await prisma.documentPermission.findFirst({ where: { documentId: document.id, membershipId: memberMembershipId } });
  assert.ok(grant);
  assert.equal(grant.canView, true);

  const grantedNotification = await prisma.notification.findFirst({ where: { tenantId: organizationId, recipientId: memberMembershipId, type: "access.granted" } });
  assert.ok(grantedNotification);

  const allowed = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/${document.id}`, headers: { cookie: memberCookies } });
  assert.equal(allowed.statusCode, 200);
});

test("access panel returns owner, member grants and share links", async () => {
  const document = await uploadText(adminCookies, `panel-${marker}.txt`, "panel content");

  const share = await app.inject({ method: "PUT", url: `/api/v1/organizations/${organizationId}/document/${document.id}/permissions`, headers: { cookie: adminCookies }, payload: { membershipId: memberMembershipId, view: true, edit: true, delete: false, share: false } });
  assert.equal(share.statusCode, 204);

  const link = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/share-links`, headers: { cookie: adminCookies }, payload: { expiresInHours: 24, permission: "READ" } });
  assert.equal(link.statusCode, 201, link.body);

  const panel = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/access/document/${document.id}`, headers: { cookie: adminCookies } });
  assert.equal(panel.statusCode, 200, panel.body);
  const body = panel.json();
  assert.equal(body.inheritsPermissions, true);
  assert.equal(body.linksCount, 1);
  assert.ok(body.owner);
  const sources = body.entries.map((entry: { source: string }) => entry.source);
  assert.ok(sources.includes("owner"));
  assert.ok(sources.includes("user"));
  assert.ok(sources.includes("link"));
  const memberEntry = body.entries.find((entry: { source: string; membershipId?: string }) => entry.source === "user" && entry.membershipId === memberMembershipId);
  assert.ok(memberEntry);
  assert.equal(memberEntry.access.edit, true);
});

test("pinned items sort first and expose pinnedAt", async () => {
  const folderId = await rootFolderId();
  const first = await uploadText(adminCookies, `aaa-${marker}.txt`, "a", folderId);
  const second = await uploadText(adminCookies, `zzz-${marker}.txt`, "z", folderId);

  const pin = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${second.id}/pin`, headers: { cookie: adminCookies }, payload: { pinned: true } });
  assert.equal(pin.statusCode, 200, pin.body);
  assert.ok(pin.json().document.pinnedAt);

  const listing = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents?folderId=${folderId}&sort=name&order=asc`, headers: { cookie: adminCookies } });
  assert.equal(listing.statusCode, 200);
  const names = listing.json().documents.map((item: { id: string; name: string }) => item.id);
  assert.ok(names.indexOf(second.id) < names.indexOf(first.id), "pinned document must come first");

  const unpin = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${second.id}/pin`, headers: { cookie: adminCookies }, payload: { pinned: false } });
  assert.equal(unpin.statusCode, 200);
  assert.equal(unpin.json().document.pinnedAt, null);
});

test("retention policies block delete and purge", async () => {
  const folderId = await rootFolderId();
  const createFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: adminCookies }, payload: { name: `Retenção-${marker}`, parentId: folderId } });
  assert.equal(createFolder.statusCode, 201);
  const retentionFolderId = createFolder.json().id as string;

  const govern = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/folders/${retentionFolderId}/governance`, headers: { cookie: adminCookies }, payload: { retentionMode: "BLOCK_DELETE" } });
  assert.equal(govern.statusCode, 200, govern.body);
  assert.equal(govern.json().governance.retentionMode, "BLOCK_DELETE");

  const document = await uploadText(adminCookies, `retained-${marker}.txt`, "retained content", retentionFolderId);
  const softDelete = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/documents/${document.id}`, headers: { cookie: adminCookies } });
  assert.equal(softDelete.statusCode, 409);
  assert.equal(softDelete.json().error.code, "RETENTION_BLOCKED");

  // RETAIN allows trashing but blocks permanent deletion inside the window.
  const retain = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/folders/${retentionFolderId}/governance`, headers: { cookie: adminCookies }, payload: { retentionMode: "RETAIN", retentionDays: 30 } });
  assert.equal(retain.statusCode, 200);

  const trash = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/documents/${document.id}`, headers: { cookie: adminCookies } });
  assert.equal(trash.statusCode, 204);

  const purge = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/trash/document/${document.id}`, headers: { cookie: adminCookies } });
  assert.equal(purge.statusCode, 409);
  assert.equal(purge.json().error.code, "RETENTION_BLOCKED");

  // Removing the policy allows purging again.
  const clear = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/folders/${retentionFolderId}/governance`, headers: { cookie: adminCookies }, payload: { retentionMode: "NONE", retentionDays: null } });
  assert.equal(clear.statusCode, 200);
  const purgeAllowed = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/trash/document/${document.id}`, headers: { cookie: adminCookies } });
  assert.equal(purgeAllowed.statusCode, 204);
});

test("sensitivity labels block public share links", async () => {
  const folderId = await rootFolderId();
  const createFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: adminCookies }, payload: { name: `Confidencial-${marker}`, parentId: folderId } });
  assert.equal(createFolder.statusCode, 201);
  const sensitiveFolderId = createFolder.json().id as string;

  const govern = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/folders/${sensitiveFolderId}/governance`, headers: { cookie: adminCookies }, payload: { sensitivity: "CONFIDENTIAL" } });
  assert.equal(govern.statusCode, 200);
  assert.equal(govern.json().governance.sensitivity, "CONFIDENTIAL");

  const document = await uploadText(adminCookies, `secret-${marker}.txt`, "secret content", sensitiveFolderId);
  const link = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/share-links`, headers: { cookie: adminCookies }, payload: { expiresInHours: 24, permission: "READ" } });
  assert.equal(link.statusCode, 409);
  assert.equal(link.json().error.code, "SENSITIVITY_BLOCKED");

  // INTERNAL again -> share link allowed.
  const downgrade = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/folders/${sensitiveFolderId}/governance`, headers: { cookie: adminCookies }, payload: { sensitivity: "INTERNAL" } });
  assert.equal(downgrade.statusCode, 200);
  const allowed = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/share-links`, headers: { cookie: adminCookies }, payload: { expiresInHours: 24, permission: "READ" } });
  assert.equal(allowed.statusCode, 201);
});

test("webhooks: CRUD, RBAC guard and signed delivery on document.created", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; signature?: string; event?: string }[] = [];
  globalThis.fetch = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
    calls.push({ url: String(input), signature: init?.headers?.["X-Nexora-Signature"], event: init?.headers?.["X-Nexora-Event"] });
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  try {
    // Members without webhooks.manage are rejected.
    const forbidden = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/webhooks`, headers: { cookie: memberCookies }, payload: { name: "Hook", url: "https://hooks.example.test/x", events: ["document.created"] } });
    assert.equal(forbidden.statusCode, 403);

    const created = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/webhooks`, headers: { cookie: adminCookies }, payload: { name: "Doc events", url: "https://hooks.example.test/nexora", events: ["document.created"] } });
    assert.equal(created.statusCode, 201, created.body);
    const webhook = created.json().webhook;
    assert.ok(created.json().secret.startsWith("whsec_"));
    assert.equal("secret" in webhook, false);

    const document = await uploadText(adminCookies, `webhooked-${marker}.txt`, "webhook content");
    await waitFor(async () => {
      const delivery = await prisma.webhookDelivery.findFirst({ where: { tenantId: organizationId, webhookId: webhook.id, event: "document.created" } });
      return delivery?.status === "SUCCESS";
    });

    const call = calls.find((entry) => entry.url === "https://hooks.example.test/nexora" && entry.event === "document.created");
    assert.ok(call);
    assert.ok(call.signature!.startsWith("sha256="));

    const deliveries = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/webhooks/${webhook.id}/deliveries`, headers: { cookie: adminCookies } });
    assert.equal(deliveries.statusCode, 200);
    assert.ok(deliveries.json().deliveries.some((d: { event: string; status: string }) => d.event === "document.created" && d.status === "SUCCESS"));

    const testDelivery = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/webhooks/${webhook.id}/test`, headers: { cookie: adminCookies } });
    assert.equal(testDelivery.statusCode, 201, testDelivery.body);
    assert.equal(testDelivery.json().event, "webhook.test");
    assert.equal(testDelivery.json().status, "SUCCESS");
    void document;
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI auto-metadata fills empty fields from extracted content", async () => {
  const folderId = await rootFolderId();
  const createFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: adminCookies }, payload: { name: `Metadados-${marker}`, parentId: folderId } });
  assert.equal(createFolder.statusCode, 201);
  const metaFolderId = createFolder.json().id as string;

  const setFields = await app.inject({
    method: "PUT",
    url: `/api/v1/organizations/${organizationId}/folders/${metaFolderId}/metadata-fields`,
    headers: { cookie: adminCookies },
    payload: {
      fields: [
        { name: "Tipo", slug: "tipo", type: "choice", required: false, options: [{ value: "contrato", label: "Contrato" }, { value: "fatura", label: "Fatura" }], order: 0 },
        { name: "Cliente", slug: "cliente", type: "text", required: false, order: 1 }
      ]
    }
  });
  assert.equal(setFields.statusCode, 200, setFields.body);

  const document = await uploadText(adminCookies, `auto-${marker}.txt`, `Este contrato estabelece os termos do acordo. Cliente: Acme Lda.`, metaFolderId);
  assert.equal(document.metadata.tipo, "contrato");
  assert.equal(document.metadata.cliente, "Acme Lda");
  assert.ok(document.metadataAuto.includes("tipo"));
  assert.ok(document.metadataAuto.includes("cliente"));

  // Manual trigger reports what was suggested and does not overwrite filled values.
  const manual = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/autofill-metadata`, headers: { cookie: adminCookies } });
  assert.equal(manual.statusCode, 200, manual.body);
  assert.ok("suggested" in manual.json());
  assert.equal(manual.json().applied.tipo, undefined);
});

test("recent and favorites endpoints return accessible items", async () => {
  const document = await uploadText(adminCookies, `recent-${marker}.txt`, "recent content");

  const recent = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/recent`, headers: { cookie: adminCookies } });
  assert.equal(recent.statusCode, 200);
  const entry = recent.json().documents.find((item: { id: string }) => item.id === document.id);
  assert.ok(entry);
  assert.ok("folderName" in entry);

  const favorite = await app.inject({ method: "PUT", url: `/api/v1/organizations/${organizationId}/document/${document.id}/favorite`, headers: { cookie: adminCookies }, payload: { favorite: true } });
  assert.equal(favorite.statusCode, 204);

  const favorites = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/favorites`, headers: { cookie: adminCookies } });
  assert.equal(favorites.statusCode, 200);
  assert.ok(favorites.json().documents.some((item: { id: string }) => item.id === document.id));
});
