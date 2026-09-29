import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `inv-admin-${marker}@example.com`;
const invitedEmail = `inv-user-${marker}@example.com`;
const existingEmail = `inv-existing-${marker}@example.com`;
const organizationIds: string[] = [];
const userEmails = [adminEmail, invitedEmail, existingEmail];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

function extractToken(url: string) {
  return new URL(url).searchParams.get("token")!;
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: userEmails } } });
  await app.close();
  await prisma.$disconnect();
});

test("Invitations: create, preview, accept (new and existing user), revoke and permissions", async () => {
  const registration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Invite Admin", email: adminEmail, password: "InvitePass123", organizationName: "Invite Org" }
  });
  assert.equal(registration.statusCode, 201, registration.body);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  // --- Create invitation ---
  const invite = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/invitations`,
    headers: { cookie: adminCookies },
    payload: { email: invitedEmail, role: "Member" }
  });
  assert.equal(invite.statusCode, 201, invite.body);
  const inviteBody = invite.json();
  assert.ok(inviteBody.inviteUrl.includes("token="));
  assert.equal(inviteBody.invitation.email, invitedEmail);
  assert.equal(inviteBody.invitation.status, "PENDING");

  const token = extractToken(inviteBody.inviteUrl);

  // --- List invitations ---
  const list = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/invitations`,
    headers: { cookie: adminCookies }
  });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().length, 1);

  // --- Preview (public) ---
  const preview = await app.inject({ method: "GET", url: `/api/v1/auth/invitations/${token}` });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().organizationName, "Invite Org");
  assert.equal(preview.json().accountExists, false);

  // --- Accept as new user ---
  const accept = await app.inject({
    method: "POST",
    url: `/api/v1/auth/invitations/${token}/accept`,
    payload: { name: "Invited User", password: "NewMemberPass123" }
  });
  assert.equal(accept.statusCode, 201, accept.body);
  const session = accept.json();
  assert.equal(session.user.email, invitedEmail);
  assert.ok(session.organizations.some((o: { id: string }) => o.id === organizationId));

  // --- Token cannot be reused ---
  const reuse = await app.inject({
    method: "POST",
    url: `/api/v1/auth/invitations/${token}/accept`,
    payload: { name: "Reuse", password: "NewMemberPass123" }
  });
  assert.equal(reuse.statusCode, 410);

  // --- Invite an existing account ---
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Existing User", email: existingEmail, password: "ExistingPass123", organizationName: "Other Org" }
  }).then((r) => organizationIds.push(r.json().organizations[0].id));

  const invite2 = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/invitations`,
    headers: { cookie: adminCookies },
    payload: { email: existingEmail, role: "Viewer" }
  });
  assert.equal(invite2.statusCode, 201, invite2.body);
  const token2 = extractToken(invite2.json().inviteUrl);

  const preview2 = await app.inject({ method: "GET", url: `/api/v1/auth/invitations/${token2}` });
  assert.equal(preview2.json().accountExists, true);

  const accept2 = await app.inject({
    method: "POST",
    url: `/api/v1/auth/invitations/${token2}/accept`,
    payload: {}
  });
  assert.equal(accept2.statusCode, 201, accept2.body);
  assert.ok(accept2.json().organizations.some((o: { id: string }) => o.id === organizationId));

  // --- Duplicate invite for existing member is rejected ---
  const duplicate = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/invitations`,
    headers: { cookie: adminCookies },
    payload: { email: invitedEmail, role: "Member" }
  });
  assert.equal(duplicate.statusCode, 409);

  // --- Revoke ---
  const invite3 = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/invitations`,
    headers: { cookie: adminCookies },
    payload: { email: `revoked-${marker}@example.com`, role: "Member" }
  });
  assert.equal(invite3.statusCode, 201);
  const invitation3 = invite3.json().invitation;
  const token3 = extractToken(invite3.json().inviteUrl);

  const revoke = await app.inject({
    method: "DELETE",
    url: `/api/v1/organizations/${organizationId}/invitations/${invitation3.id}`,
    headers: { cookie: adminCookies }
  });
  assert.equal(revoke.statusCode, 204);

  const revokedPreview = await app.inject({ method: "GET", url: `/api/v1/auth/invitations/${token3}` });
  assert.equal(revokedPreview.statusCode, 410);

  // --- Non-member cannot create invitations ---
  const outsider = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Outsider", email: `outsider-${marker}@example.com`, password: "OutsiderPass123", organizationName: "Outsider Org" }
  });
  organizationIds.push(outsider.json().organizations[0].id);
  const forbidden = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/invitations`,
    headers: { cookie: cookies(outsider) },
    payload: { email: `x-${marker}@example.com`, role: "Member" }
  });
  assert.equal(forbidden.statusCode, 403);
});
