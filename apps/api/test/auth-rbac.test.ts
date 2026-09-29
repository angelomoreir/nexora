import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashToken } from "../src/lib/security.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminOneEmail = `admin-one-${marker}@example.com`;
const adminTwoEmail = `admin-two-${marker}@example.com`;
const viewerEmail = `viewer-${marker}@example.com`;
const managerEmail = `manager-${marker}@example.com`;
const createdOrganizationIds: string[] = [];

function cookieHeader(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  const cookies = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  return cookies.map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => {
  await app.ready();
});

after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminOneEmail, adminTwoEmail, viewerEmail, managerEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("authentication, user creation, permissions and organization isolation", async () => {
  const registerOne = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      name: "Admin One",
      email: adminOneEmail,
      password: "SecurePassword123",
      organizationName: "Organization One"
    }
  });
  assert.equal(registerOne.statusCode, 201);
  const organizationOneId = registerOne.json().organizations[0].id as string;
  createdOrganizationIds.push(organizationOneId);
  const adminOneCookies = cookieHeader(registerOne);
  assert.match(adminOneCookies, /nexora_access=/);
  assert.match(adminOneCookies, /nexora_refresh=/);

  const storedAdmin = await prisma.user.findUniqueOrThrow({ where: { email: adminOneEmail } });
  assert.notEqual(storedAdmin.passwordHash, "SecurePassword123");
  assert.match(storedAdmin.passwordHash ?? "", /^\$argon2id\$/);

  const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie: adminOneCookies } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.email, adminOneEmail);

  const createViewer = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationOneId}/users`,
    headers: { cookie: adminOneCookies },
    payload: {
      name: "Viewer User",
      email: viewerEmail,
      password: "ViewerPassword123",
      jobTitle: "Auditor",
      role: "Viewer"
    }
  });
  assert.equal(createViewer.statusCode, 201);
  assert.deepEqual(createViewer.json().roles, ["Viewer"]);

  const createManager = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationOneId}/users`,
    headers: { cookie: adminOneCookies },
    payload: {
      name: "Manager User",
      email: managerEmail,
      password: "ManagerPassword123",
      role: "Manager"
    }
  });
  assert.equal(createManager.statusCode, 201);

  const registerTwo = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      name: "Admin Two",
      email: adminTwoEmail,
      password: "SecurePassword456",
      organizationName: "Organization Two"
    }
  });
  assert.equal(registerTwo.statusCode, 201);
  const organizationTwoId = registerTwo.json().organizations[0].id as string;
  createdOrganizationIds.push(organizationTwoId);

  const viewerLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: viewerEmail, password: "ViewerPassword123" }
  });
  assert.equal(viewerLogin.statusCode, 200);
  const viewerCookies = cookieHeader(viewerLogin);

  const forbiddenCreate = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationOneId}/users`,
    headers: { cookie: viewerCookies },
    payload: {
      name: "Blocked User",
      email: `blocked-${marker}@example.com`,
      password: "BlockedPassword123",
      role: "Member"
    }
  });
  assert.equal(forbiddenCreate.statusCode, 403);
  assert.equal(forbiddenCreate.json().error.code, "FORBIDDEN");

  const managerLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: managerEmail, password: "ManagerPassword123" }
  });
  assert.equal(managerLogin.statusCode, 200);
  const managerCookies = cookieHeader(managerLogin);
  const privilegeEscalation = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationOneId}/users`,
    headers: { cookie: managerCookies },
    payload: {
      name: "Escalated User",
      email: `escalated-${marker}@example.com`,
      password: "EscalatedPassword123",
      role: "Admin"
    }
  });
  assert.equal(privilegeEscalation.statusCode, 403);

  const crossOrganizationAccess = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationTwoId}/users`,
    headers: { cookie: viewerCookies }
  });
  assert.equal(crossOrganizationAccess.statusCode, 403);

  const refresh = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    headers: { cookie: viewerCookies }
  });
  assert.equal(refresh.statusCode, 200);
  const rotatedViewerCookies = cookieHeader(refresh);
  assert.match(rotatedViewerCookies, /nexora_refresh=/);

  const logout = await app.inject({
    method: "POST",
    url: "/api/v1/auth/logout",
    headers: { cookie: rotatedViewerCookies }
  });
  assert.equal(logout.statusCode, 204);
  const clearedCookies = logout.headers["set-cookie"];
  assert.ok(clearedCookies);

  const rejectedAccess = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: { cookie: rotatedViewerCookies }
  });
  assert.equal(rejectedAccess.statusCode, 401);

  const rejectedRefresh = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    headers: { cookie: viewerCookies }
  });
  assert.equal(rejectedRefresh.statusCode, 401);

  const viewer = await prisma.user.findUniqueOrThrow({ where: { email: viewerEmail } });
  const passwordResetToken = `password-reset-${marker}-${"x".repeat(32)}`;
  await prisma.passwordResetToken.create({
    data: {
      userId: viewer.id,
      tokenHash: hashToken(passwordResetToken),
      expiresAt: new Date(Date.now() + 60_000)
    }
  });
  const resetPassword = await app.inject({
    method: "POST",
    url: "/api/v1/auth/reset-password",
    payload: { token: passwordResetToken, password: "NewViewerPassword456" }
  });
  assert.equal(resetPassword.statusCode, 200);
  const oldPasswordLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: viewerEmail, password: "ViewerPassword123" }
  });
  assert.equal(oldPasswordLogin.statusCode, 401);
  const newPasswordLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: viewerEmail, password: "NewViewerPassword456" }
  });
  assert.equal(newPasswordLogin.statusCode, 200);
});
