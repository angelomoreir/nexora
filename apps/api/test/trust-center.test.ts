import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `trust-admin-${marker}@example.com`;
const memberEmail = `trust-member-${marker}@example.com`;
const suspendedEmail = `trust-suspended-${marker}@example.com`;
const otherEmail = `trust-other-${marker}@example.com`;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => app.ready());

after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, memberEmail, suspendedEmail, otherEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("sessions endpoint lists only own active sessions and marks the current one", async () => {
  const registration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Trust Admin", email: adminEmail, password: "TrustPassword123", organizationName: "Trust Organization" }
  });
  assert.equal(registration.statusCode, 201, registration.body);
  organizationIds.push(registration.json().organizations[0].id as string);
  const adminCookies = cookies(registration);

  const list = await app.inject({ method: "GET", url: "/api/v1/auth/sessions", headers: { cookie: adminCookies } });
  assert.equal(list.statusCode, 200, list.body);
  assert.equal(list.json().sessions.length, 1);
  assert.equal(list.json().sessions[0].current, true);

  const secondLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: adminEmail, password: "TrustPassword123" } });
  assert.equal(secondLogin.statusCode, 200, secondLogin.body);

  const relist = await app.inject({ method: "GET", url: "/api/v1/auth/sessions", headers: { cookie: adminCookies } });
  assert.equal(relist.statusCode, 200, relist.body);
  assert.equal(relist.json().sessions.length, 2);
  assert.equal(relist.json().sessions.filter((s: { current: boolean }) => s.current).length, 1);
  const otherSession = relist.json().sessions.find((s: { current: boolean }) => !s.current);
  assert.ok(otherSession);

  const revoke = await app.inject({ method: "DELETE", url: `/api/v1/auth/sessions/${otherSession.id}`, headers: { cookie: adminCookies } });
  assert.equal(revoke.statusCode, 204, revoke.body);

  const afterRevoke = await app.inject({ method: "GET", url: "/api/v1/auth/sessions", headers: { cookie: adminCookies } });
  assert.equal(afterRevoke.json().sessions.length, 1);

  const unauthenticated = await app.inject({ method: "GET", url: "/api/v1/auth/sessions" });
  assert.equal(unauthenticated.statusCode, 401);
});

test("a user cannot revoke another user's session", async () => {
  const otherRegistration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Other User", email: otherEmail, password: "OtherPassword123", organizationName: "Other Trust Org" }
  });
  assert.equal(otherRegistration.statusCode, 201, otherRegistration.body);
  organizationIds.push(otherRegistration.json().organizations[0].id as string);
  const otherUser = await prisma.user.findUniqueOrThrow({ where: { email: otherEmail } });
  const otherSession = await prisma.refreshSession.findFirstOrThrow({ where: { userId: otherUser.id, revokedAt: null } });

  const adminLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: adminEmail, password: "TrustPassword123" } });
  assert.equal(adminLogin.statusCode, 200, adminLogin.body);
  const adminCookies = cookies(adminLogin);

  const revoke = await app.inject({ method: "DELETE", url: `/api/v1/auth/sessions/${otherSession.id}`, headers: { cookie: adminCookies } });
  assert.equal(revoke.statusCode, 404, revoke.body);
  assert.equal(revoke.json().error.code, "NOT_FOUND");

  const stillActive = await prisma.refreshSession.findUniqueOrThrow({ where: { id: otherSession.id } });
  assert.equal(stillActive.revokedAt, null);
});

test("security overview requires audit permission and returns tenant-scoped data", async () => {
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  const organizationId = (await prisma.organizationMember.findFirstOrThrow({ where: { userId: adminUser.id } })).tenantId;
  const adminMembership = await prisma.organizationMember.findUniqueOrThrow({ where: { tenantId_userId: { tenantId: organizationId, userId: adminUser.id } } });
  const adminLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: adminEmail, password: "TrustPassword123" } });
  const adminCookies = cookies(adminLogin);

  const addMember = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/users`,
    headers: { cookie: adminCookies },
    payload: { name: "Trust Member", email: memberEmail, password: "MemberPassword123", role: "Member" }
  });
  assert.equal(addMember.statusCode, 201, addMember.body);
  const memberLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: memberEmail, password: "MemberPassword123" } });
  assert.equal(memberLogin.statusCode, 200, memberLogin.body);
  const memberCookies = cookies(memberLogin);

  const suspendedUser = await prisma.user.create({ data: { name: "Suspended", email: suspendedEmail } });
  await prisma.organizationMember.create({ data: { tenantId: organizationId, userId: suspendedUser.id, status: "SUSPENDED" } });

  const memberRole = await prisma.role.findUniqueOrThrow({ where: { tenantId_name: { tenantId: organizationId, name: "Member" } } });
  await prisma.invitation.create({
    data: { tenantId: organizationId, email: `pending-${marker}@example.com`, roleId: memberRole.id, tokenHash: `invite-${marker}`, invitedById: adminMembership.id, expiresAt: new Date(Date.now() + 86_400_000) }
  });
  await prisma.invitation.create({
    data: { tenantId: organizationId, email: `expired-${marker}@example.com`, roleId: memberRole.id, tokenHash: `expired-${marker}`, invitedById: adminMembership.id, expiresAt: new Date(Date.now() - 86_400_000) }
  });

  await prisma.auditLog.createMany({
    data: [
      { tenantId: organizationId, actorId: adminMembership.id, action: "auth.login", resourceType: "User", ipAddress: "10.0.0.1", result: "FAILURE" },
      { tenantId: organizationId, actorId: adminMembership.id, action: "settings.updated", resourceType: "OrganizationSettings" },
      { tenantId: organizationId, actorId: adminMembership.id, action: "role.updated", resourceType: "Role" },
      { tenantId: organizationId, actorId: adminMembership.id, action: "document.viewed", resourceType: "Document" },
      { tenantId: organizationId, actorId: adminMembership.id, action: "auth.login", resourceType: "User", result: "FAILURE", occurredAt: new Date(Date.now() - 45 * 86_400_000) }
    ]
  });

  const denied = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/security/overview`, headers: { cookie: memberCookies } });
  assert.equal(denied.statusCode, 403, denied.body);

  const response = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/security/overview`, headers: { cookie: adminCookies } });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.sso.enabled, false);
  assert.equal(body.sso.issuerUrl, null);
  assert.deepEqual(body.sso.emailDomains, []);
  assert.equal(body.passwordPolicy.minLength, 8);
  assert.equal(body.passwordPolicy.requireUpper, true);
  assert.equal(body.members.active, 2);
  assert.equal(body.members.suspended, 1);
  assert.equal(body.members.pendingInvitations, 1);
  assert.ok(body.sessions.active >= 2);
  assert.equal(body.securityEvents30d.failedLogins, 1);
  assert.ok(body.securityEvents30d.logins >= 2);
  assert.equal(body.securityEvents30d.settingsChanges, 1);
  assert.equal(body.securityEvents30d.roleChanges, 1);
  const actions = body.recentSecurityEvents.map((e: { action: string }) => e.action);
  assert.ok(actions.includes("auth.login"));
  assert.ok(actions.includes("settings.updated"));
  assert.ok(actions.includes("role.updated"));
  assert.ok(!actions.includes("document.viewed"));
  const failedEntry = body.recentSecurityEvents.find((e: { result: string }) => e.result === "FAILURE");
  assert.equal(failedEntry.actorName, "Trust Admin");
  assert.equal(failedEntry.ipAddress, "10.0.0.1");

  // Tenant isolation: data from another organization must not leak
  const otherOrganizationId = organizationIds[1]!;
  await prisma.ssoConfiguration.create({
    data: { tenantId: otherOrganizationId, issuerUrl: "https://idp.example.com", clientId: "other", clientSecret: "x", isEnabled: true }
  });
  await prisma.auditLog.create({
    data: { tenantId: otherOrganizationId, action: "auth.login", resourceType: "User", result: "FAILURE" }
  });

  const scoped = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/security/overview`, headers: { cookie: adminCookies } });
  assert.equal(scoped.statusCode, 200, scoped.body);
  assert.equal(scoped.json().sso.enabled, false);
  assert.equal(scoped.json().securityEvents30d.failedLogins, 1);
});
