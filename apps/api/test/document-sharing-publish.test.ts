import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ownerEmail = `sharing-owner-${marker}@example.com`;
const memberEmail = `sharing-member-${marker}@example.com`;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

async function multipart(filename: string, content: string, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", new Blob([content], { type: "text/plain" }), filename);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const request = new Request("http://localhost", { method: "POST", body: form });
  return { payload: Buffer.from(await request.arrayBuffer()), contentType: request.headers.get("content-type")! };
}

function tokenOf(link: { url?: string }) {
  return new URL(link.url!).pathname.split("/").pop()!;
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, memberEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

let organizationId = "";
let ownerCookies = "";
let memberCookies = "";
let memberId = "";

test("setup: organization, owner and member", async () => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Sharing Owner", email: ownerEmail, password: "OwnerPassword123", organizationName: "Sharing Organization" } });
  assert.equal(registration.statusCode, 201, registration.body);
  organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  ownerCookies = cookies(registration);

  const createMember = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: ownerCookies }, payload: { name: "Sharing Member", email: memberEmail, password: "MemberPassword123", role: "Member" } });
  assert.equal(createMember.statusCode, 201, createMember.body);
  memberId = createMember.json().memberId as string;
  const memberLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: memberEmail, password: "MemberPassword123" } });
  memberCookies = cookies(memberLogin);
});

test("folder share links allow public browsing, file download and upload-only file requests", async () => {
  const folder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: ownerCookies }, payload: { name: `Public ${marker}` } });
  assert.equal(folder.statusCode, 201, folder.body);
  const folderId = folder.json().id as string;

  const uploadBody = await multipart("readme.txt", "public folder file");
  const upload = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents?folderId=${folderId}`, headers: { cookie: ownerCookies, "content-type": uploadBody.contentType }, payload: uploadBody.payload });
  assert.equal(upload.statusCode, 201, upload.body);
  const documentId = upload.json().document.id as string;

  // READ link: browse + download
  const readLink = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders/${folderId}/share-links`, headers: { cookie: ownerCookies }, payload: { expiresInHours: 24, permission: "READ" } });
  assert.equal(readLink.statusCode, 201, readLink.body);
  const readToken = tokenOf(readLink.json());

  const info = await app.inject({ method: "GET", url: `/api/v1/shares/${readToken}` });
  assert.equal(info.statusCode, 200);
  assert.equal(info.json().kind, "folder");

  const browse = await app.inject({ method: "GET", url: `/api/v1/shares/${readToken}/browse` });
  assert.equal(browse.statusCode, 200, browse.body);
  assert.ok(browse.json().items.some((item: { id: string; kind: string }) => item.id === documentId && item.kind === "document"));

  const fileDownload = await app.inject({ method: "GET", url: `/api/v1/shares/${readToken}/files/${documentId}/download` });
  assert.equal(fileDownload.statusCode, 200);
  assert.equal(fileDownload.rawPayload.toString(), "public folder file");

  // UPLOAD link (file request): uploads accepted, browsing rejected
  const uploadLink = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders/${folderId}/share-links`, headers: { cookie: ownerCookies }, payload: { expiresInHours: 24, permission: "UPLOAD" } });
  assert.equal(uploadLink.statusCode, 201, uploadLink.body);
  const uploadToken = tokenOf(uploadLink.json());

  const browseDenied = await app.inject({ method: "GET", url: `/api/v1/shares/${uploadToken}/browse` });
  assert.equal(browseDenied.statusCode, 403);

  const requestBody = await multipart("external.txt", "external upload");
  const fileRequest = await app.inject({ method: "POST", url: `/api/v1/shares/${uploadToken}/uploads`, headers: { "content-type": requestBody.contentType }, payload: requestBody.payload });
  assert.equal(fileRequest.statusCode, 201, fileRequest.body);
  const requested = await prisma.document.findFirstOrThrow({ where: { tenantId: organizationId, folderId, name: "external.txt" } });
  assert.equal(requested.tenantId, organizationId);

  const links = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/folders/${folderId}/share-links`, headers: { cookie: ownerCookies } });
  assert.equal(links.statusCode, 200);
  assert.equal(links.json().length, 2);
  assert.ok(links.json().every((link: { targetType: string }) => link.targetType === "folder"));

  const revoke = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/folders/${folderId}/share-links/${uploadLink.json().id}`, headers: { cookie: ownerCookies } });
  assert.equal(revoke.statusCode, 204);
  const revoked = await app.inject({ method: "GET", url: `/api/v1/shares/${uploadToken}` });
  assert.equal(revoked.statusCode, 404);
});

test("bulk download returns a zip archive of selected documents", async () => {
  const body = await multipart("bulk.txt", "bulk content");
  const upload = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents`, headers: { cookie: ownerCookies, "content-type": body.contentType }, payload: body.payload });
  assert.equal(upload.statusCode, 201, upload.body);
  const documentId = upload.json().document.id as string;

  const zip = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/bulk-download`, headers: { cookie: ownerCookies }, payload: { documentIds: [documentId], folderIds: [] } });
  assert.equal(zip.statusCode, 200, zip.body);
  assert.equal(zip.headers["content-type"], "application/zip");
  assert.equal(zip.rawPayload.subarray(0, 2).toString(), "PK");
  assert.ok(zip.rawPayload.includes(Buffer.from("bulk content")) || zip.rawPayload.includes(Buffer.from("bulk.txt")));
});

test("shared-with-me lists documents shared with the member", async () => {
  const document = await prisma.document.findFirstOrThrow({ where: { tenantId: organizationId, name: "bulk.txt" } });
  const share = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/shares`, headers: { cookie: ownerCookies }, payload: { targetType: "USER", targetId: memberId, permission: "READ" } });
  assert.equal(share.statusCode, 204, share.body);

  const shared = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/shared`, headers: { cookie: memberCookies } });
  assert.equal(shared.statusCode, 200, shared.body);
  const entry = shared.json().sharedWithMe.find((item: { id: string }) => item.id === document.id);
  assert.ok(entry);
  assert.equal(entry.sharedVia, "DIRECT");
});

test("minor versions stay drafts and publish promotes them to major", async () => {
  const body = await multipart("policy.txt", "v1 published");
  const upload = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents`, headers: { cookie: ownerCookies, "content-type": body.contentType }, payload: body.payload });
  assert.equal(upload.statusCode, 201, upload.body);
  const documentId = upload.json().document.id as string;
  assert.equal(upload.json().document.publishStatus, "PUBLISHED");
  assert.equal(upload.json().versions[0].versionType, "MAJOR");
  assert.equal(upload.json().versions[0].label, "1.0");

  const draftBody = await multipart("policy.txt", "draft change", { versionType: "minor" });
  const draftUpload = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/versions`, headers: { cookie: ownerCookies, "content-type": draftBody.contentType }, payload: draftBody.payload });
  assert.equal(draftUpload.statusCode, 201, draftUpload.body);
  assert.equal(draftUpload.json().document.publishStatus, "DRAFT");
  assert.equal(draftUpload.json().versions[0].versionType, "MINOR");
  assert.equal(draftUpload.json().versions[0].label, "1.1");

  // Draft is not served as the current download.
  const download = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/download`, headers: { cookie: ownerCookies } });
  assert.equal(download.rawPayload.toString(), "v1 published");

  const publish = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/publish`, headers: { cookie: ownerCookies }, payload: {} });
  assert.equal(publish.statusCode, 200, publish.body);
  assert.equal(publish.json().document.publishStatus, "PUBLISHED");
  assert.equal(publish.json().versions[0].versionType, "MAJOR");
  assert.equal(publish.json().versions[0].label, "2.0");
  const afterPublish = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/download`, headers: { cookie: ownerCookies } });
  assert.equal(afterPublish.rawPayload.toString(), "draft change");
});

test("content approval routes publication through approvers", async () => {
  // Folder requiring approval for content publication.
  const folder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: ownerCookies }, payload: { name: `Approval ${marker}` } });
  const folderId = folder.json().id as string;
  const governance = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/folders/${folderId}/governance`, headers: { cookie: ownerCookies }, payload: { requireApproval: true } });
  assert.equal(governance.statusCode, 200, governance.body);
  assert.equal(governance.json().governance.requireApproval, true);

  const body = await multipart("governed.txt", "needs approval");
  const upload = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents?folderId=${folderId}`, headers: { cookie: ownerCookies, "content-type": body.contentType }, payload: body.payload });
  assert.equal(upload.statusCode, 201, upload.body);
  const documentId = upload.json().document.id as string;

  // Give the member edit-only access (no share right, so they cannot self-approve).
  await app.inject({ method: "PUT", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/permissions`, headers: { cookie: ownerCookies }, payload: { membershipId: memberId, view: true, edit: true, delete: false, share: false } });

  const minorBody = await multipart("governed.txt", "member draft", { versionType: "minor" });
  const minor = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/versions`, headers: { cookie: memberCookies, "content-type": minorBody.contentType }, payload: minorBody.payload });
  assert.equal(minor.statusCode, 201, minor.body);

  const submit = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/publish`, headers: { cookie: memberCookies }, payload: {} });
  assert.equal(submit.statusCode, 200, submit.body);
  assert.equal(submit.json().document.publishStatus, "PENDING");

  // The requester cannot approve their own submission.
  const selfApprove = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/approve`, headers: { cookie: memberCookies }, payload: {} });
  assert.equal(selfApprove.statusCode, 403);

  const approve = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/approve`, headers: { cookie: ownerCookies }, payload: {} });
  assert.equal(approve.statusCode, 200, approve.body);
  assert.equal(approve.json().document.publishStatus, "PUBLISHED");

  const published = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/download`, headers: { cookie: ownerCookies } });
  assert.equal(published.rawPayload.toString(), "member draft");
});

test("document activity aggregates audit entries", async () => {
  const document = await prisma.document.findFirstOrThrow({ where: { tenantId: organizationId, name: "governed.txt" } });
  const activity = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/${document.id}/activity`, headers: { cookie: ownerCookies } });
  assert.equal(activity.statusCode, 200, activity.body);
  const actions = activity.json().activity.map((entry: { action: string }) => entry.action);
  assert.ok(actions.includes("document.uploaded"));
  assert.ok(actions.includes("document.published") || actions.includes("document.publish_requested"));
  assert.ok(activity.json().stats.edits >= 1);
});
