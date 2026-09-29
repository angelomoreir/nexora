import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ownerEmail = `version-owner-${marker}@example.com`;
const memberEmail = `version-member-${marker}@example.com`;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

async function multipart(filename: string, content: string) {
  const form = new FormData();
  form.append("file", new Blob([content], { type: "application/pdf" }), filename);
  const request = new Request("http://localhost", { method: "POST", body: form });
  return { payload: Buffer.from(await request.arrayBuffer()), contentType: request.headers.get("content-type")! };
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, memberEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("versions preserve files and support historical download and restore", async () => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Version Owner", email: ownerEmail, password: "VersionPassword123", organizationName: "Version Organization" } });
  assert.equal(registration.statusCode, 201);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const ownerCookies = cookies(registration);

  const firstBody = await multipart("Contrato.pdf", "%PDF-1.4 version-one");
  const firstUpload = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents`, headers: { cookie: ownerCookies, "content-type": firstBody.contentType }, payload: firstBody.payload });
  assert.equal(firstUpload.statusCode, 201, firstUpload.body);
  const documentId = firstUpload.json().document.id as string;
  const firstVersionId = firstUpload.json().versions[0].id as string;

  const secondBody = await multipart("Contrato.pdf", "%PDF-1.4 version-two");
  const secondUpload = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/versions`, headers: { cookie: ownerCookies, "content-type": secondBody.contentType }, payload: secondBody.payload });
  assert.equal(secondUpload.statusCode, 201, secondUpload.body);
  assert.deepEqual(secondUpload.json().versions.map((version: { version: number }) => version.version), [2, 1]);
  assert.equal(secondUpload.json().versions[0].creator.name, "Version Owner");
  assert.equal(secondUpload.json().versions[0].current, true);

  const oldDownload = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/versions/${firstVersionId}/download`, headers: { cookie: ownerCookies } });
  assert.equal(oldDownload.statusCode, 200);
  assert.equal(oldDownload.rawPayload.toString(), "%PDF-1.4 version-one");

  const restore = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/versions/${firstVersionId}/restore`, headers: { cookie: ownerCookies } });
  assert.equal(restore.statusCode, 200, restore.body);
  assert.deepEqual(restore.json().versions.map((version: { version: number }) => version.version), [3, 2, 1]);
  assert.equal(restore.json().versions[0].current, true);
  const currentDownload = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/download`, headers: { cookie: ownerCookies } });
  assert.equal(currentDownload.rawPayload.toString(), "%PDF-1.4 version-one");

  const actions = await prisma.auditLog.findMany({ where: { tenantId: organizationId, resourceId: documentId }, select: { action: true } });
  assert.ok(actions.filter(({ action }) => action === "document.uploaded").length >= 2);
  assert.ok(actions.some(({ action }) => action === "document.version.downloaded"));
  assert.ok(actions.some(({ action }) => action === "document.version.restored"));
  assert.ok(actions.some(({ action }) => action === "document.downloaded"));
});

test("documents can be shared with users, teams, organizations and temporary protected links", async () => {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const sourceMembership = await prisma.organizationMember.findFirstOrThrow({ where: { userId: owner.id, tenantId: organizationIds[0] } });
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: ownerEmail, password: "VersionPassword123" } });
  const ownerCookies = cookies(login);
  const sourceOrganizationId = organizationIds[0]!;
  const document = await prisma.document.findFirstOrThrow({ where: { tenantId: sourceOrganizationId } });

  const createMember = await app.inject({ method: "POST", url: `/api/v1/organizations/${sourceOrganizationId}/users`, headers: { cookie: ownerCookies }, payload: { name: "Version Member", email: memberEmail, password: "MemberPassword123", role: "Member" } });
  assert.equal(createMember.statusCode, 201);
  const memberId = createMember.json().memberId as string;
  const userShare = await app.inject({ method: "POST", url: `/api/v1/organizations/${sourceOrganizationId}/documents/${document.id}/shares`, headers: { cookie: ownerCookies }, payload: { targetType: "USER", targetId: memberId, permission: "EDIT" } });
  assert.equal(userShare.statusCode, 204);
  const memberLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: memberEmail, password: "MemberPassword123" } });
  const memberCookies = cookies(memberLogin);
  const userAccess = await app.inject({ method: "GET", url: `/api/v1/organizations/${sourceOrganizationId}/documents/${document.id}`, headers: { cookie: memberCookies } });
  assert.equal(userAccess.statusCode, 200);
  assert.equal(userAccess.json().document.permissions.edit, true);
  await prisma.documentPermission.deleteMany({ where: { documentId: document.id, membershipId: memberId } });

  const team = await prisma.team.create({ data: { tenantId: sourceOrganizationId, name: `Legal ${marker}` } });
  await prisma.teamMember.create({ data: { tenantId: sourceOrganizationId, teamId: team.id, membershipId: memberId } });
  const teamShare = await app.inject({ method: "POST", url: `/api/v1/organizations/${sourceOrganizationId}/documents/${document.id}/shares`, headers: { cookie: ownerCookies }, payload: { targetType: "TEAM", targetId: team.id, permission: "READ" } });
  assert.equal(teamShare.statusCode, 204);
  const teamAccess = await app.inject({ method: "GET", url: `/api/v1/organizations/${sourceOrganizationId}/documents/${document.id}`, headers: { cookie: memberCookies } });
  assert.equal(teamAccess.statusCode, 200);
  assert.equal(teamAccess.json().document.permissions.view, true);
  assert.equal(teamAccess.json().document.permissions.edit, false);

  const targetOrganization = await app.inject({ method: "POST", url: "/api/v1/organizations", headers: { cookie: ownerCookies }, payload: { name: "Target Organization" } });
  assert.equal(targetOrganization.statusCode, 201);
  const targetOrganizationId = targetOrganization.json().id as string;
  organizationIds.push(targetOrganizationId);
  const organizationShare = await app.inject({ method: "POST", url: `/api/v1/organizations/${sourceOrganizationId}/documents/${document.id}/shares`, headers: { cookie: ownerCookies }, payload: { targetType: "ORGANIZATION", targetId: targetOrganizationId, permission: "READ" } });
  assert.equal(organizationShare.statusCode, 204, organizationShare.body);
  const externalAccess = await app.inject({ method: "GET", url: `/api/v1/organizations/${targetOrganizationId}/documents/${document.id}`, headers: { cookie: ownerCookies } });
  assert.equal(externalAccess.statusCode, 200, externalAccess.body);

  const protectedLink = await app.inject({ method: "POST", url: `/api/v1/organizations/${sourceOrganizationId}/documents/${document.id}/share-links`, headers: { cookie: ownerCookies }, payload: { expiresInHours: 24, password: "LinkPassword123", permission: "READ" } });
  assert.equal(protectedLink.statusCode, 201, protectedLink.body);
  assert.equal(protectedLink.json().passwordProtected, true);
  assert.doesNotMatch(protectedLink.json().url, /storage/i);
  const token = new URL(protectedLink.json().url).pathname.split("/").pop()!;
  const deniedWithoutPassword = await app.inject({ method: "GET", url: `/api/v1/shares/${token}` });
  assert.equal(deniedWithoutPassword.statusCode, 401);
  const publicInfo = await app.inject({ method: "GET", url: `/api/v1/shares/${token}`, headers: { "x-share-password": "LinkPassword123" } });
  assert.equal(publicInfo.statusCode, 200);
  assert.equal(publicInfo.json().name, document.name);
  const publicDownload = await app.inject({ method: "GET", url: `/api/v1/shares/${token}/download`, headers: { "x-share-password": "LinkPassword123" } });
  assert.equal(publicDownload.statusCode, 200);
  const blockedEditBody = await multipart("Contrato.pdf", "%PDF-1.4 blocked-edit");
  const blockedEdit = await app.inject({ method: "POST", url: `/api/v1/shares/${token}/versions`, headers: { "x-share-password": "LinkPassword123", "content-type": blockedEditBody.contentType }, payload: blockedEditBody.payload });
  assert.equal(blockedEdit.statusCode, 403);
  await prisma.documentShareLink.update({ where: { id: protectedLink.json().id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
  const expired = await app.inject({ method: "GET", url: `/api/v1/shares/${token}`, headers: { "x-share-password": "LinkPassword123" } });
  assert.equal(expired.statusCode, 404);

  const editLink = await app.inject({ method: "POST", url: `/api/v1/organizations/${sourceOrganizationId}/documents/${document.id}/share-links`, headers: { cookie: ownerCookies }, payload: { expiresInHours: 1, permission: "EDIT" } });
  const editToken = new URL(editLink.json().url).pathname.split("/").pop()!;
  const editBody = await multipart("Contrato.pdf", "%PDF-1.4 link-edit");
  const publicEdit = await app.inject({ method: "POST", url: `/api/v1/shares/${editToken}/versions`, headers: { "content-type": editBody.contentType }, payload: editBody.payload });
  assert.equal(publicEdit.statusCode, 201, publicEdit.body);

  const revoke = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${sourceOrganizationId}/documents/${document.id}/share-links/${editLink.json().id}`, headers: { cookie: ownerCookies } });
  assert.equal(revoke.statusCode, 204);
  const revoked = await app.inject({ method: "GET", url: `/api/v1/shares/${editToken}` });
  assert.equal(revoked.statusCode, 404);

  const sharedActions = await prisma.auditLog.findMany({ where: { tenantId: sourceOrganizationId, resourceId: document.id }, select: { action: true } });
  assert.ok(sharedActions.some(({ action }) => action === "document.shared"));
  assert.ok(sharedActions.some(({ action }) => action === "document.link.created"));
  assert.ok(sharedActions.some(({ action }) => action === "document.link.downloaded"));
  assert.ok(sharedActions.some(({ action }) => action === "document.link.edited"));
  assert.ok(sourceMembership);

  const remove = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${sourceOrganizationId}/documents/${document.id}`, headers: { cookie: ownerCookies } });
  assert.equal(remove.statusCode, 204);
  assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: sourceOrganizationId, resourceId: document.id, action: "document.trashed" } }));
});
