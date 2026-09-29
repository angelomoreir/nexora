import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { storage } from "../src/services/storage/index.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `collab-admin-${marker}@example.com`;
const memberEmail = `collab-member-${marker}@example.com`;
const zetaEmail = `collab-zeta-${marker}@example.com`;
const organizationIds: string[] = [];

let organizationId = "";
let adminCookies = "";
let memberCookies = "";
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

async function listDocumentIds(cookie: string, folderId?: string) {
  const response = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents${folderId ? `?folderId=${folderId}` : ""}`, headers: { cookie } });
  assert.equal(response.statusCode, 200);
  return response.json() as { folders: { id: string; name: string }[]; documents: { id: string; name: string }[] };
}

before(async () => {
  await app.ready();
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Collab Admin", email: adminEmail, password: "CollabPassword123", organizationName: "Collab Organization" } });
  assert.equal(registration.statusCode, 201);
  organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  adminCookies = cookies(registration);

  const createMember = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Collab Member", email: memberEmail, password: "MemberPassword123", role: "Member" } });
  assert.equal(createMember.statusCode, 201, createMember.body);
  memberMembershipId = createMember.json().memberId as string;
  const memberLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: memberEmail, password: "MemberPassword123" } });
  assert.equal(memberLogin.statusCode, 200);
  memberCookies = cookies(memberLogin);
});

after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, memberEmail, zetaEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("trash: documents and folders are soft deleted, listed, restored and purged", async () => {
  const document = await uploadText(adminCookies, `trash-${marker}.txt`, `trash test ${marker}`);
  const stored = await prisma.document.findUniqueOrThrow({ where: { id: document.id } });

  const remove = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/documents/${document.id}`, headers: { cookie: adminCookies } });
  assert.equal(remove.statusCode, 204);
  let listing = await listDocumentIds(adminCookies);
  assert.equal(listing.documents.some((item) => item.id === document.id), false);

  let trash = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/trash`, headers: { cookie: adminCookies } });
  assert.equal(trash.statusCode, 200);
  const trashDoc = trash.json().documents.find((item: { id: string }) => item.id === document.id);
  assert.ok(trashDoc);
  assert.equal(trashDoc.kind, "document");
  assert.equal(trashDoc.originalLocation, "Documentos");
  assert.ok(trashDoc.deletedAt);
  assert.ok(trashDoc.deletedBy?.id);

  const restore = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/trash/document/${document.id}/restore`, headers: { cookie: adminCookies } });
  assert.equal(restore.statusCode, 204, restore.body);
  listing = await listDocumentIds(adminCookies);
  assert.ok(listing.documents.some((item) => item.id === document.id));

  const removeAgain = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/documents/${document.id}`, headers: { cookie: adminCookies } });
  assert.equal(removeAgain.statusCode, 204);
  const purge = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/trash/document/${document.id}`, headers: { cookie: adminCookies } });
  assert.equal(purge.statusCode, 204);
  assert.equal(await prisma.document.findUnique({ where: { id: document.id } }), null);
  assert.equal(await storage.exists(stored.storageKey!), false);

  // Folder subtree
  const createFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: adminCookies }, payload: { name: `TrashFolder-${marker}` } });
  assert.equal(createFolder.statusCode, 201);
  const folderId = createFolder.json().id as string;
  const innerDoc = await uploadText(adminCookies, `inner-${marker}.txt`, `inner ${marker}`, folderId);

  const removeFolder = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/folders/${folderId}`, headers: { cookie: adminCookies } });
  assert.equal(removeFolder.statusCode, 204);
  listing = await listDocumentIds(adminCookies);
  assert.equal(listing.folders.some((item) => item.id === folderId), false);
  assert.equal(listing.documents.some((item) => item.id === innerDoc.id), false);

  trash = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/trash`, headers: { cookie: adminCookies } });
  assert.equal(trash.statusCode, 200);
  assert.ok(trash.json().folders.some((item: { id: string }) => item.id === folderId));
  assert.equal(trash.json().documents.some((item: { id: string }) => item.id === innerDoc.id), false);

  const restoreFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/trash/folder/${folderId}/restore`, headers: { cookie: adminCookies } });
  assert.equal(restoreFolder.statusCode, 204, restoreFolder.body);
  listing = await listDocumentIds(adminCookies);
  assert.ok(listing.folders.some((item) => item.id === folderId));
  const innerListing = await listDocumentIds(adminCookies, folderId);
  assert.ok(innerListing.documents.some((item) => item.id === innerDoc.id));
  const restoredDoc = await prisma.document.findUniqueOrThrow({ where: { id: innerDoc.id } });
  assert.equal(restoredDoc.folderId, folderId);

  // Same name as a trashed folder must not block creation
  const removeFolderAgain = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/folders/${folderId}`, headers: { cookie: adminCookies } });
  assert.equal(removeFolderAgain.statusCode, 204);
  const recreate = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: adminCookies }, payload: { name: `TrashFolder-${marker}` } });
  assert.equal(recreate.statusCode, 201, recreate.body);
});

test("check-out blocks other editors until check-in", async () => {
  const document = await uploadText(adminCookies, `checkout-${marker}.txt`, `checkout ${marker}`);

  const checkout = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/checkout`, headers: { cookie: adminCookies } });
  assert.equal(checkout.statusCode, 200, checkout.body);
  const adminMembership = await prisma.organizationMember.findFirstOrThrow({ where: { tenantId: organizationId, user: { email: adminEmail } } });
  const checkedOut = checkout.json().document.checkedOut;
  assert.equal(checkedOut.membershipId, adminMembership.id);
  assert.ok(checkedOut.user.id);
  assert.ok(checkedOut.at);

  const memberVersion = await multipart(`checkout-${marker}.txt`, "text/plain", new TextEncoder().encode("member edit"));
  const memberUpload = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/versions`, headers: { cookie: memberCookies, "content-type": memberVersion.contentType }, payload: memberVersion.payload });
  assert.equal(memberUpload.statusCode, 409);
  assert.equal(memberUpload.json().error.code, "DOCUMENT_CHECKED_OUT");

  const adminVersion = await multipart(`checkout-${marker}.txt`, "text/plain", new TextEncoder().encode("admin edit"));
  const adminUpload = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/versions`, headers: { cookie: adminCookies, "content-type": adminVersion.contentType }, payload: adminVersion.payload });
  assert.equal(adminUpload.statusCode, 201, adminUpload.body);

  const memberCheckin = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/checkin`, headers: { cookie: memberCookies } });
  assert.equal(memberCheckin.statusCode, 403);

  const adminCheckin = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/checkin`, headers: { cookie: adminCookies } });
  assert.equal(adminCheckin.statusCode, 200, adminCheckin.body);
  assert.equal(adminCheckin.json().document.checkedOut, null);

  const memberVersion2 = await multipart(`checkout-${marker}.txt`, "text/plain", new TextEncoder().encode("member edit 2"));
  const memberUpload2 = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/versions`, headers: { cookie: memberCookies, "content-type": memberVersion2.contentType }, payload: memberVersion2.payload });
  assert.equal(memberUpload2.statusCode, 201, memberUpload2.body);
});

test("document comments with mentions notify and enforce author-only deletion", async () => {
  const document = await uploadText(adminCookies, `comments-${marker}.txt`, `comments ${marker}`);

  const create = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/comments`, headers: { cookie: adminCookies }, payload: { body: "Olá @Collab Member e @Collab Member, revê este documento." } });
  assert.equal(create.statusCode, 201, create.body);
  const comment = create.json();
  assert.equal(comment.author.name, "Collab Admin");

  const list = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/comments`, headers: { cookie: memberCookies } });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().length, 1);
  assert.equal(list.json()[0].id, comment.id);

  const mentions = await prisma.notification.findMany({ where: { tenantId: organizationId, recipientId: memberMembershipId, type: "user.mentioned" } });
  assert.equal(mentions.length, 1);

  const addZeta = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Zeta Reviewer", email: zetaEmail, password: "MemberPassword123", role: "Member" } });
  assert.equal(addZeta.statusCode, 201, addZeta.body);
  const zetaMembershipId = addZeta.json().memberId as string;
  const legacy = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/comments`, headers: { cookie: adminCookies }, payload: { body: "@Zeta podes validar?" } });
  assert.equal(legacy.statusCode, 201, legacy.body);
  const zetaMentions = await prisma.notification.findMany({ where: { tenantId: organizationId, recipientId: zetaMembershipId, type: "user.mentioned" } });
  assert.equal(zetaMentions.length, 1);

  const noMatch = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/comments`, headers: { cookie: adminCookies }, payload: { body: "Escreve para contacta@Zeta Reviewer ou tenta @Ze apenas." } });
  assert.equal(noMatch.statusCode, 201, noMatch.body);
  const zetaAfter = await prisma.notification.count({ where: { tenantId: organizationId, recipientId: zetaMembershipId, type: "user.mentioned" } });
  assert.equal(zetaAfter, 1);

  const restricted = await uploadText(adminCookies, `restricted-${marker}.txt`, `restricted ${marker}`);
  const restrict = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/access/document/${restricted.id}/inherit`, headers: { cookie: adminCookies }, payload: { inherit: false } });
  assert.equal(restrict.statusCode, 200, restrict.body);
  const memberView = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/${restricted.id}`, headers: { cookie: memberCookies } });
  assert.equal(memberView.statusCode, 403);
  const beforeBlocked = await prisma.notification.count({ where: { tenantId: organizationId, recipientId: memberMembershipId, type: "user.mentioned" } });
  const blockedComment = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${restricted.id}/comments`, headers: { cookie: adminCookies }, payload: { body: "@Collab Member isto é confidencial." } });
  assert.equal(blockedComment.statusCode, 201, blockedComment.body);
  const afterBlocked = await prisma.notification.count({ where: { tenantId: organizationId, recipientId: memberMembershipId, type: "user.mentioned" } });
  assert.equal(afterBlocked, beforeBlocked);

  const memberDelete = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/comments/${comment.id}`, headers: { cookie: memberCookies } });
  assert.equal(memberDelete.statusCode, 403);

  const adminDelete = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/comments/${comment.id}`, headers: { cookie: adminCookies } });
  assert.equal(adminDelete.statusCode, 204);
});

test("folder metadata fields are inherited and validate document metadata", async () => {
  const createFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: adminCookies }, payload: { name: `MetaFolder-${marker}` } });
  assert.equal(createFolder.statusCode, 201);
  const folderId = createFolder.json().id as string;
  const createSub = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: adminCookies }, payload: { name: `MetaSub-${marker}`, parentId: folderId } });
  assert.equal(createSub.statusCode, 201);
  const subFolderId = createSub.json().id as string;

  const put = await app.inject({ method: "PUT", url: `/api/v1/organizations/${organizationId}/folders/${folderId}/metadata-fields`, headers: { cookie: adminCookies }, payload: { fields: [
    { name: "Cliente", slug: "cliente", type: "text", required: true, options: null, order: 0 },
    { name: "Estado", slug: "estado", type: "choice", required: false, options: [{ value: "A", label: "A" }, { value: "B", label: "B" }], order: 1 },
    { name: "Valor", slug: "valor", type: "number", required: false, options: null, order: 2 }
  ] } });
  assert.equal(put.statusCode, 200, put.body);
  assert.equal(put.json().fields.length, 3);

  const subFields = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/folders/${subFolderId}/metadata-fields`, headers: { cookie: adminCookies } });
  assert.equal(subFields.statusCode, 200);
  assert.equal(subFields.json().fields.length, 0);
  assert.equal(subFields.json().inherited.length, 3);
  assert.ok(subFields.json().inherited.some((field: { slug: string }) => field.slug === "cliente"));

  const document = await uploadText(adminCookies, `meta-${marker}.txt`, `meta ${marker}`, subFolderId);

  const missingRequired = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/metadata`, headers: { cookie: adminCookies }, payload: { values: { estado: "A" } } });
  assert.equal(missingRequired.statusCode, 400);

  const invalidChoice = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/metadata`, headers: { cookie: adminCookies }, payload: { values: { cliente: "Acme", estado: "Z" } } });
  assert.equal(invalidChoice.statusCode, 400);

  const valid = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/metadata`, headers: { cookie: adminCookies }, payload: { values: { cliente: "Acme", estado: "A", valor: 42 } } });
  assert.equal(valid.statusCode, 200, valid.body);
  assert.deepEqual(valid.json().document.metadata, { cliente: "Acme", estado: "A", valor: 42 });
  assert.equal(valid.json().metadataFields.length, 3);

  const listing = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents?folderId=${subFolderId}`, headers: { cookie: adminCookies } });
  assert.equal(listing.statusCode, 200);
  assert.equal(listing.json().metadataFields.length, 3);
});

test("search finds documents by content text and metadata values with snippets", async () => {
  const token = `zebraquantum-${marker}`;
  const metaToken = `zebraclient-${marker}`;

  const document = await uploadText(adminCookies, `search-${marker}.txt`, `alpha body ${token} omega tail`);

  const search = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/search?q=${token}`, headers: { cookie: adminCookies } });
  assert.equal(search.statusCode, 200, search.body);
  const group = search.json().groups.find((item: { type: string }) => item.type === "document");
  assert.ok(group);
  const result = group.results.find((item: { id: string }) => item.id === document.id);
  assert.ok(result);
  assert.ok(result.snippet);
  assert.ok(result.snippet.includes(token));

  // Metadata search: create a folder field and set a searchable value
  const createFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: adminCookies }, payload: { name: `SearchMeta-${marker}` } });
  const folderId = createFolder.json().id as string;
  await app.inject({ method: "PUT", url: `/api/v1/organizations/${organizationId}/folders/${folderId}/metadata-fields`, headers: { cookie: adminCookies }, payload: { fields: [{ name: "Cliente", slug: "cliente", type: "text", required: false, options: null, order: 0 }] } });
  const metaDoc = await uploadText(adminCookies, `metasearch-${marker}.txt`, "plain content", folderId);
  const patch = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/documents/${metaDoc.id}/metadata`, headers: { cookie: adminCookies }, payload: { values: { cliente: metaToken } } });
  assert.equal(patch.statusCode, 200, patch.body);

  const metaSearch = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/search?q=${metaToken}`, headers: { cookie: adminCookies } });
  assert.equal(metaSearch.statusCode, 200);
  const metaGroup = metaSearch.json().groups.find((item: { type: string }) => item.type === "document");
  assert.ok(metaGroup);
  assert.ok(metaGroup.results.some((item: { id: string }) => item.id === metaDoc.id));
});
