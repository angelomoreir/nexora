import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `security-admin-${marker}@example.com`;
const memberEmail = `security-member-${marker}@example.com`;
let organizationId = "";

function cookieHeader(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  const cookies = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  return cookies.map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => {
  await app.ready();
});

after(async () => {
  if (organizationId) {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, memberEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("user CRUD remains scoped to the organization", async () => {
  const registration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      name: "Security Admin",
      email: adminEmail,
      password: "SecurityPassword123",
      organizationName: "Security Organization"
    }
  });
  assert.equal(registration.statusCode, 201);
  organizationId = registration.json().organizations[0].id as string;
  const adminCookies = cookieHeader(registration);

  const creation = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/users`,
    headers: { cookie: adminCookies },
    payload: {
      name: "Scoped Member",
      email: memberEmail,
      password: "ScopedPassword123",
      role: "Editor"
    }
  });
  assert.equal(creation.statusCode, 201);
  const userId = creation.json().id as string;

  const detail = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/users/${userId}`,
    headers: { cookie: adminCookies }
  });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().email, memberEmail);

  const update = await app.inject({
    method: "PATCH",
    url: `/api/v1/organizations/${organizationId}/users/${userId}`,
    headers: { cookie: adminCookies },
    payload: { role: "Viewer", memberStatus: "ACTIVE" }
  });
  assert.equal(update.statusCode, 200);
  assert.deepEqual(update.json().roles, ["Viewer"]);

  const profileUpdateByAdmin = await app.inject({
    method: "PATCH",
    url: `/api/v1/organizations/${organizationId}/users/${userId}`,
    headers: { cookie: adminCookies },
    payload: { name: "Changed By Admin" }
  });
  assert.equal(profileUpdateByAdmin.statusCode, 403);
  assert.equal(profileUpdateByAdmin.json().error.code, "PROFILE_OWNERSHIP_REQUIRED");

  const globalStatusUpdateByAdmin = await app.inject({
    method: "PATCH",
    url: `/api/v1/organizations/${organizationId}/users/${userId}`,
    headers: { cookie: adminCookies },
    payload: { status: "SUSPENDED" }
  });
  assert.equal(globalStatusUpdateByAdmin.statusCode, 403);
  assert.equal(globalStatusUpdateByAdmin.json().error.code, "SUPER_ADMIN_REQUIRED");

  const removal = await app.inject({
    method: "DELETE",
    url: `/api/v1/organizations/${organizationId}/users/${userId}`,
    headers: { cookie: adminCookies }
  });
  assert.equal(removal.statusCode, 204);

  const suspendedMember = await prisma.organizationMember.findFirstOrThrow({
    where: { tenantId: organizationId, userId }
  });
  assert.equal(suspendedMember.status, "SUSPENDED");

  const memberLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: memberEmail, password: "ScopedPassword123" }
  });
  assert.equal(memberLogin.statusCode, 200);
  assert.deepEqual(memberLogin.json().organizations, []);
  const memberAccess = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/users`,
    headers: { cookie: cookieHeader(memberLogin) }
  });
  assert.equal(memberAccess.statusCode, 403);
});

test("validation, recovery configuration and rate limiting fail safely", async () => {
  const invalidRegistration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "A", email: "invalid", password: "weak", organizationName: "A" }
  });
  assert.equal(invalidRegistration.statusCode, 400);
  assert.equal(invalidRegistration.json().error.code, "VALIDATION_ERROR");

  const knownRecovery = await app.inject({
    method: "POST",
    url: "/api/v1/auth/forgot-password",
    payload: { email: adminEmail }
  });
  const unknownRecovery = await app.inject({
    method: "POST",
    url: "/api/v1/auth/forgot-password",
    payload: { email: `unknown-${marker}@example.com` }
  });
  assert.equal(knownRecovery.statusCode, 503);
  assert.equal(unknownRecovery.statusCode, 503);
  assert.equal(knownRecovery.body, unknownRecovery.body);

  const attempts = [];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    attempts.push(
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: `missing-${marker}@example.com`, password: "IncorrectPassword123" }
      })
    );
  }
  assert.ok(attempts.some((response) => response.statusCode === 429));
  assert.ok(attempts.filter((response) => response.statusCode === 401).every((response) => response.json().error.code === "INVALID_CREDENTIALS"));
});
