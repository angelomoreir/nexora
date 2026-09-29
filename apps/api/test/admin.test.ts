import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `ad-admin-${marker}@example.com`;
const viewerEmail = `ad-viewer-${marker}@example.com`;
const organizationIds: string[] = [];
const userEmails = [adminEmail, viewerEmail];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: userEmails } } });
  await app.close();
  await prisma.$disconnect();
});

test("admin center: audit logs, settings, teams, and roles with permission enforcement", async () => {
  // --- Setup: register admin + add viewer ---
  const registration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Admin User", email: adminEmail, password: "AdminPassword123", organizationName: "Admin Org" }
  });
  assert.equal(registration.statusCode, 201, registration.body);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  const addViewer = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/users`,
    headers: { cookie: adminCookies },
    payload: { name: "Viewer User", email: viewerEmail, password: "ViewerPassword123", role: "Viewer" }
  });
  assert.equal(addViewer.statusCode, 201, addViewer.body);
  const viewerLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: viewerEmail, password: "ViewerPassword123" }
  });
  assert.equal(viewerLogin.statusCode, 200);
  const viewerCookies = cookies(viewerLogin);

  // --- Audit: login should create audit log ---
  const auditAfterLogin = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/audit`,
    headers: { cookie: adminCookies }
  });
  assert.equal(auditAfterLogin.statusCode, 200, auditAfterLogin.body);
  const auditData = auditAfterLogin.json();
  assert.ok(auditData.logs.length > 0, "Audit should have entries");
  const loginLog = auditData.logs.find((l: { action: string }) => l.action === "auth.login");
  assert.ok(loginLog, "Login should be audited");
  assert.ok(loginLog.ipAddress, "Login audit should have IP address");

  // --- Audit: viewer cannot access audit (no audit.view permission) ---
  const viewerAudit = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/audit`,
    headers: { cookie: viewerCookies }
  });
  assert.equal(viewerAudit.statusCode, 403, "Viewer should not access audit logs");

  // --- Audit: filters work ---
  const filteredAudit = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/audit?action=auth.login`,
    headers: { cookie: adminCookies }
  });
  assert.equal(filteredAudit.statusCode, 200);
  const filteredData = filteredAudit.json();
  assert.ok(filteredData.logs.every((l: { action: string }) => l.action === "auth.login"), "Filter should only return auth.login actions");

  // --- Audit: search works ---
  const searchAudit = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/audit?search=login`,
    headers: { cookie: adminCookies }
  });
  assert.equal(searchAudit.statusCode, 200);
  const searchData = searchAudit.json();
  assert.ok(searchData.logs.length > 0, "Search should find login-related logs");

  // --- Settings: get default settings ---
  const getSettings = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/settings`,
    headers: { cookie: adminCookies }
  });
  assert.equal(getSettings.statusCode, 200, getSettings.body);
  const settings = getSettings.json();
  assert.equal(settings.language, "pt-PT");
  assert.equal(settings.timezone, "Europe/Lisbon");
  assert.equal(settings.passwordPolicy.minLength, 8);
  assert.ok(settings.passwordPolicy.requireUpper);
  assert.ok(settings.passwordPolicy.requireLower);
  assert.ok(settings.passwordPolicy.requireDigit);
  assert.equal(settings.passwordPolicy.requireSymbol, false);
  assert.equal(settings.storageQuotaBytes, 10737418240);
  assert.ok(settings.notificationsEnabled);

  // --- Settings: viewer cannot access settings ---
  const viewerSettings = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/settings`,
    headers: { cookie: viewerCookies }
  });
  assert.equal(viewerSettings.statusCode, 403, "Viewer should not access settings");

  // --- Settings: update settings ---
  const updateSettings = await app.inject({
    method: "PATCH",
    url: `/api/v1/organizations/${organizationId}/settings`,
    headers: { cookie: adminCookies },
    payload: {
      language: "en-US",
      timezone: "America/New_York",
      passwordMinLength: 12,
      passwordRequireSymbol: true,
      storageQuotaBytes: 5368709120,
      emailNotifications: true
    }
  });
  assert.equal(updateSettings.statusCode, 200, updateSettings.body);
  const updated = updateSettings.json();
  assert.equal(updated.language, "en-US");
  assert.equal(updated.timezone, "America/New_York");
  assert.equal(updated.passwordPolicy.minLength, 12);
  assert.equal(updated.passwordPolicy.requireSymbol, true);
  assert.equal(updated.storageQuotaBytes, 5368709120);
  assert.equal(updated.emailNotifications, true);

  // --- Settings: audit log created for update ---
  const settingsAudit = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/audit?action=settings.updated`,
    headers: { cookie: adminCookies }
  });
  assert.equal(settingsAudit.statusCode, 200);
  assert.ok(settingsAudit.json().logs.length > 0, "Settings update should be audited");

  // --- Teams: list (empty initially) ---
  const listTeams = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/teams`,
    headers: { cookie: adminCookies }
  });
  assert.equal(listTeams.statusCode, 200, listTeams.body);
  assert.ok(Array.isArray(listTeams.json()));

  // --- Teams: create ---
  const createTeam = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/teams`,
    headers: { cookie: adminCookies },
    payload: { name: "Equipa de Teste", description: "Descrição da equipa" }
  });
  assert.equal(createTeam.statusCode, 201, createTeam.body);
  const teamId = createTeam.json().id;
  assert.equal(createTeam.json().name, "Equipa de Teste");
  assert.equal(createTeam.json().memberCount, 0);

  // --- Teams: duplicate name fails ---
  const dupTeam = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/teams`,
    headers: { cookie: adminCookies },
    payload: { name: "Equipa de Teste" }
  });
  assert.equal(dupTeam.statusCode, 409);

  // --- Teams: get detail ---
  const teamDetail = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/teams/${teamId}`,
    headers: { cookie: adminCookies }
  });
  assert.equal(teamDetail.statusCode, 200);
  assert.equal(teamDetail.json().members.length, 0);

  // --- Teams: add member ---
  const viewerMemberId = addViewer.json().memberId;
  const addMember = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/teams/${teamId}/members`,
    headers: { cookie: adminCookies },
    payload: { membershipId: viewerMemberId }
  });
  assert.equal(addMember.statusCode, 204, addMember.body);

  // --- Teams: verify member added ---
  const teamDetailWithMember = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/teams/${teamId}`,
    headers: { cookie: adminCookies }
  });
  assert.equal(teamDetailWithMember.json().members.length, 1);
  assert.equal(teamDetailWithMember.json().members[0].email, viewerEmail);

  // --- Teams: remove member ---
  const removeMember = await app.inject({
    method: "DELETE",
    url: `/api/v1/organizations/${organizationId}/teams/${teamId}/members/${viewerMemberId}`,
    headers: { cookie: adminCookies }
  });
  assert.equal(removeMember.statusCode, 204);

  // --- Teams: update ---
  const updateTeam = await app.inject({
    method: "PATCH",
    url: `/api/v1/organizations/${organizationId}/teams/${teamId}`,
    headers: { cookie: adminCookies },
    payload: { name: "Equipa Atualizada" }
  });
  assert.equal(updateTeam.statusCode, 200);
  assert.equal(updateTeam.json().name, "Equipa Atualizada");

  // --- Teams: delete ---
  const deleteTeam = await app.inject({
    method: "DELETE",
    url: `/api/v1/organizations/${organizationId}/teams/${teamId}`,
    headers: { cookie: adminCookies }
  });
  assert.equal(deleteTeam.statusCode, 204);

  // --- Roles: list ---
  const listRoles = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/roles`,
    headers: { cookie: adminCookies }
  });
  assert.equal(listRoles.statusCode, 200, listRoles.body);
  const roles = listRoles.json();
  assert.ok(roles.length >= 6, "Should have at least 6 system roles");
  const adminRole = roles.find((r: { name: string }) => r.name === "Admin");
  assert.ok(adminRole, "Admin role should exist");
  assert.ok(adminRole.permissions.length > 0, "Admin should have permissions");

  // --- Roles: list permissions ---
  const listPerms = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/permissions`,
    headers: { cookie: adminCookies }
  });
  assert.equal(listPerms.statusCode, 200);
  const allPerms = listPerms.json();
  assert.ok(allPerms.length >= 20, "Should have at least 20 permissions");
  const permKeys = allPerms.map((p: { key: string }) => p.key);
  assert.ok(permKeys.includes("audit.view"), "Should include audit.view permission");
  assert.ok(permKeys.includes("settings.manage"), "Should include settings.manage permission");

  // --- Roles: create custom role ---
  const createRole = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/roles`,
    headers: { cookie: adminCookies },
    payload: { name: "Custom Role", description: "A custom role", permissionKeys: ["documents.view", "tasks.view"] }
  });
  assert.equal(createRole.statusCode, 201, createRole.body);
  const customRoleId = createRole.json().id;
  assert.equal(createRole.json().permissions.length, 2);

  // --- Roles: duplicate name fails ---
  const dupRole = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/roles`,
    headers: { cookie: adminCookies },
    payload: { name: "Custom Role", permissionKeys: [] }
  });
  assert.equal(dupRole.statusCode, 409);

  // --- Roles: update permissions ---
  const updateRole = await app.inject({
    method: "PATCH",
    url: `/api/v1/organizations/${organizationId}/roles/${customRoleId}`,
    headers: { cookie: adminCookies },
    payload: { permissionKeys: ["documents.view", "tasks.view", "tasks.manage"] }
  });
  assert.equal(updateRole.statusCode, 200, updateRole.body);
  assert.equal(updateRole.json().permissions.length, 3);

  // --- Roles: cannot delete system role ---
  const adminRoleId = adminRole.id;
  const deleteSystemRole = await app.inject({
    method: "DELETE",
    url: `/api/v1/organizations/${organizationId}/roles/${adminRoleId}`,
    headers: { cookie: adminCookies }
  });
  assert.equal(deleteSystemRole.statusCode, 400, "Should not delete system role");

  // --- Roles: delete custom role ---
  const deleteCustomRole = await app.inject({
    method: "DELETE",
    url: `/api/v1/organizations/${organizationId}/roles/${customRoleId}`,
    headers: { cookie: adminCookies }
  });
  assert.equal(deleteCustomRole.statusCode, 204);

  // --- Roles: viewer cannot manage roles ---
  const viewerCreateRole = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/roles`,
    headers: { cookie: viewerCookies },
    payload: { name: "Viewer Role", permissionKeys: [] }
  });
  assert.equal(viewerCreateRole.statusCode, 403, "Viewer should not create roles");

  // --- Audit: pagination ---
  const page1 = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/audit?page=1&pageSize=5`,
    headers: { cookie: adminCookies }
  });
  assert.equal(page1.statusCode, 200);
  assert.equal(page1.json().pageSize, 5);
  assert.ok(page1.json().logs.length <= 5);

  // --- Audit: resourceType filter ---
  const resourceFilter = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/audit?resourceType=Role`,
    headers: { cookie: adminCookies }
  });
  assert.equal(resourceFilter.statusCode, 200);
  assert.ok(resourceFilter.json().logs.every((l: { resourceType: string }) => l.resourceType === "Role"), "Should only return Role-related logs");

  // --- Cross-organization isolation: create second org ---
  const secondOrgReg = await app.inject({
    method: "POST",
    url: "/api/v1/organizations",
    headers: { cookie: adminCookies },
    payload: { name: "Second Org" }
  });
  assert.equal(secondOrgReg.statusCode, 201);
  const secondOrgId = secondOrgReg.json().id;
  organizationIds.push(secondOrgId);

  // --- Cross-organization: audit from org1 should not appear in org2 ---
  const secondOrgAudit = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${secondOrgId}/audit`,
    headers: { cookie: adminCookies }
  });
  assert.equal(secondOrgAudit.statusCode, 200);
  const secondOrgLogs = secondOrgAudit.json().logs;
  assert.ok(!secondOrgLogs.some((l: { action: string }) => l.action === "settings.updated"), "Org2 audit should not contain org1 settings update");

  // --- Cross-organization: settings are separate ---
  const secondOrgSettings = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${secondOrgId}/settings`,
    headers: { cookie: adminCookies }
  });
  assert.equal(secondOrgSettings.statusCode, 200);
  assert.equal(secondOrgSettings.json().language, "pt-PT", "Second org should have default settings");
});
