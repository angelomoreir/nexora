import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `rbac-admin-${marker}@example.com`;
const roleEmails = {
  Viewer: `rbac-viewer-${marker}@example.com`,
  Member: `rbac-member-${marker}@example.com`,
  Editor: `rbac-editor-${marker}@example.com`,
  Manager: `rbac-manager-${marker}@example.com`
} as const;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

async function login(email: string, remoteAddress: string) {
  const response = await app.inject({ method: "POST", url: "/api/v1/auth/login", remoteAddress, payload: { email, password: "RbacPassword123" } });
  assert.equal(response.statusCode, 200, response.body);
  return cookies(response);
}

type RoleName = keyof typeof roleEmails | "Admin";
type Expect = "allow" | "deny";
const SUCCESS = new Set([200, 201, 204]);

interface Ctx {
  org: string;
  documentId: string;
  probeUserId: string;
  probeMembershipId: string;
}

interface Probe {
  label: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  url: (ctx: Ctx) => string;
  payload?: unknown | (() => unknown);
  expected: Record<RoleName, Expect>;
}

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `10.${120 + Math.floor(ipCounter / 200)}.${ipCounter % 200}.7`;
}

async function inject(method: string, url: string, cookie: string, payload?: unknown) {
  return app.inject({
    method: method as "GET",
    url,
    headers: { cookie },
    remoteAddress: nextIp(),
    payload: payload as Record<string, unknown> | undefined
  });
}

async function uploadDoc(cookie: string, org: string) {
  const form = new FormData();
  form.append("file", new Blob([new TextEncoder().encode("%PDF-1.4 rbac").buffer], { type: "application/pdf" }), `rbac-${Math.random().toString(16).slice(2, 10)}.pdf`);
  const req = new Request("http://localhost", { method: "POST", body: form });
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${org}/documents`,
    headers: { cookie, "content-type": req.headers.get("content-type")! },
    remoteAddress: nextIp(),
    payload: Buffer.from(await req.arrayBuffer())
  });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().document.id as string;
}

async function upgradeToUnlimitedPlan(orgId: string) {
  const plan = await prisma.plan.findFirst({ where: { code: "enterprise" } })
    ?? await prisma.plan.findFirst({ where: { limitsJson: { contains: '"maxUsers":-1' } } });
  assert.ok(plan, "an unlimited plan must exist in the seeded database");
  await prisma.organizationSubscription.update({ where: { tenantId: orgId }, data: { planId: plan.id } });
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { contains: marker } } });
  await app.close();
  await prisma.$disconnect();
});

test("RBAC matrix: every role is restricted to its declared permission set across critical operations", async (t) => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", remoteAddress: nextIp(), payload: { name: "RBAC Admin", email: adminEmail, password: "RbacPassword123", organizationName: "RBAC Org" } });
  assert.equal(registration.statusCode, 201);
  const org = registration.json().organizations[0].id as string;
  organizationIds.push(org);
  await upgradeToUnlimitedPlan(org);
  const adminCookies = cookies(registration);

  const roleCookies: Record<RoleName, string> = { Admin: adminCookies, Viewer: "", Member: "", Editor: "", Manager: "" };
  for (const [role, email] of Object.entries(roleEmails)) {
    const created = await inject("POST", `/api/v1/organizations/${org}/users`, adminCookies, { name: `RBAC ${role}`, email, password: "RbacPassword123", role });
    assert.equal(created.statusCode, 201, `${role}: ${created.body}`);
    roleCookies[role as RoleName] = await login(email, nextIp());
  }

  // Dedicated throwaway member used for user-update probes so mutations don't affect matrix users.
  const probeUser = await inject("POST", `/api/v1/organizations/${org}/users`, adminCookies, { name: "Probe Target", email: `rbac-target-${marker}@example.com`, password: "RbacPassword123", role: "Member" });
  assert.equal(probeUser.statusCode, 201);

  const ctx: Ctx = {
    org,
    documentId: await uploadDoc(adminCookies, org),
    probeUserId: probeUser.json().id,
    probeMembershipId: probeUser.json().memberId
  };

  const probes: Probe[] = [
    { label: "users.read", method: "GET", url: (c) => `/api/v1/organizations/${c.org}/users`, expected: { Admin: "allow", Manager: "allow", Editor: "allow", Member: "allow", Viewer: "allow" } },
    { label: "users.create (Member)", method: "POST", url: (c) => `/api/v1/organizations/${c.org}/users`, payload: () => ({ name: "Aux User", email: `aux-${marker}-${Math.random().toString(16).slice(2, 8)}@example.com`, password: "AuxPassword123", role: "Member" }), expected: { Admin: "allow", Manager: "allow", Editor: "deny", Member: "deny", Viewer: "deny" } },
    { label: "users.create (Admin role) — privilege escalation guard", method: "POST", url: (c) => `/api/v1/organizations/${c.org}/users`, payload: { name: "Esc User", email: `esc-${marker}@example.com`, password: "EscPassword123", role: "Admin" }, expected: { Admin: "allow", Manager: "deny", Editor: "deny", Member: "deny", Viewer: "deny" } },
    { label: "users.update memberStatus", method: "PATCH", url: (c) => `/api/v1/organizations/${c.org}/users/${c.probeUserId}`, payload: { memberStatus: "ACTIVE" }, expected: { Admin: "allow", Manager: "allow", Editor: "allow", Member: "deny", Viewer: "deny" } },
    { label: "users.update role — roles.manage", method: "PATCH", url: (c) => `/api/v1/organizations/${c.org}/users/${c.probeUserId}`, payload: { role: "Viewer" }, expected: { Admin: "allow", Manager: "deny", Editor: "deny", Member: "deny", Viewer: "deny" } },
    { label: "documents.view", method: "GET", url: (c) => `/api/v1/organizations/${c.org}/documents`, expected: { Admin: "allow", Manager: "allow", Editor: "allow", Member: "allow", Viewer: "allow" } },
    { label: "documents.edit (folder create)", method: "POST", url: (c) => `/api/v1/organizations/${c.org}/folders`, payload: () => ({ name: `probe-${Math.random().toString(16).slice(2, 8)}`, parentId: null }), expected: { Admin: "allow", Manager: "allow", Editor: "allow", Member: "allow", Viewer: "deny" } },
    { label: "documents.share", method: "POST", url: (c) => `/api/v1/organizations/${c.org}/documents/${c.documentId}/shares`, payload: () => ({ targetType: "USER", targetId: ctx.probeMembershipId, permission: "READ" }), expected: { Admin: "allow", Manager: "allow", Editor: "deny", Member: "deny", Viewer: "deny" } },
    { label: "lists.view", method: "GET", url: (c) => `/api/v1/organizations/${c.org}/lists`, expected: { Admin: "allow", Manager: "allow", Editor: "allow", Member: "allow", Viewer: "allow" } },
    { label: "lists.manage", method: "POST", url: (c) => `/api/v1/organizations/${c.org}/lists`, payload: () => ({ name: `L${Math.random().toString(16).slice(2, 8)}`, fields: [] }), expected: { Admin: "allow", Manager: "allow", Editor: "allow", Member: "deny", Viewer: "deny" } },
    { label: "forms.manage", method: "POST", url: (c) => `/api/v1/organizations/${c.org}/forms`, payload: () => ({ name: `F${Math.random().toString(16).slice(2, 8)}`, fields: [] }), expected: { Admin: "allow", Manager: "allow", Editor: "allow", Member: "deny", Viewer: "deny" } },
    { label: "tasks.manage", method: "POST", url: (c) => `/api/v1/organizations/${c.org}/tasks`, payload: () => ({ title: `T${Math.random().toString(16).slice(2, 8)}` }), expected: { Admin: "allow", Manager: "allow", Editor: "allow", Member: "allow", Viewer: "deny" } },
    { label: "workflows.manage", method: "POST", url: (c) => `/api/v1/organizations/${c.org}/workflows`, payload: () => ({ name: `W${Math.random().toString(16).slice(2, 8)}`, steps: [{ order: 0, type: "START", name: "s", config: {} }, { order: 1, type: "END", name: "e", config: {} }] }), expected: { Admin: "allow", Manager: "allow", Editor: "allow", Member: "deny", Viewer: "deny" } },
    { label: "audit.view", method: "GET", url: (c) => `/api/v1/organizations/${c.org}/audit`, expected: { Admin: "allow", Manager: "allow", Editor: "deny", Member: "deny", Viewer: "deny" } },
    { label: "settings.manage", method: "PATCH", url: (c) => `/api/v1/organizations/${c.org}/settings`, payload: { language: "pt" }, expected: { Admin: "allow", Manager: "allow", Editor: "deny", Member: "deny", Viewer: "deny" } },
    { label: "roles.manage (create role)", method: "POST", url: (c) => `/api/v1/organizations/${c.org}/roles`, payload: () => ({ name: `R${Math.random().toString(16).slice(2, 8)}`, permissionKeys: [] }), expected: { Admin: "allow", Manager: "deny", Editor: "deny", Member: "deny", Viewer: "deny" } },
    { label: "webhooks.manage", method: "POST", url: (c) => `/api/v1/organizations/${c.org}/webhooks`, payload: () => ({ name: `Hook ${Math.random().toString(16).slice(2, 8)}`, url: `https://example.com/hook-${Math.random().toString(16).slice(2, 8)}`, events: ["document.created"] }), expected: { Admin: "allow", Manager: "allow", Editor: "allow", Member: "deny", Viewer: "deny" } },
    { label: "analytics.view", method: "GET", url: (c) => `/api/v1/organizations/${c.org}/analytics/operational`, expected: { Admin: "allow", Manager: "allow", Editor: "deny", Member: "deny", Viewer: "deny" } },
    { label: "sites.manage", method: "POST", url: (c) => `/api/v1/organizations/${c.org}/sites`, payload: () => ({ name: `S${Math.random().toString(16).slice(2, 8)}` }), expected: { Admin: "allow", Manager: "allow", Editor: "deny", Member: "deny", Viewer: "deny" } },
    { label: "news publish (news.manage)", method: "POST", url: (c) => `/api/v1/organizations/${c.org}/news`, payload: () => ({ title: `N${Math.random().toString(16).slice(2, 8)}`, body: "conteúdo" }), expected: { Admin: "allow", Manager: "allow", Editor: "allow", Member: "deny", Viewer: "deny" } },
    { label: "announcements (settings.manage)", method: "POST", url: (c) => `/api/v1/organizations/${c.org}/announcements`, payload: () => ({ title: `A${Math.random().toString(16).slice(2, 8)}`, body: "aviso" }), expected: { Admin: "allow", Manager: "allow", Editor: "deny", Member: "deny", Viewer: "deny" } }
  ];

  const failures: string[] = [];
  for (const probe of probes) {
    for (const role of ["Viewer", "Member", "Editor", "Manager", "Admin"] as RoleName[]) {
      const payload = typeof probe.payload === "function" ? probe.payload() : probe.payload;
      const status = (await inject(probe.method, probe.url(ctx), roleCookies[role], payload)).statusCode;
      const want = probe.expected[role];
      if (want === "allow" && !SUCCESS.has(status)) {
        failures.push(`${probe.label}: ${role} expected allow, got ${status}`);
      } else if (want === "deny" && SUCCESS.has(status)) {
        failures.push(`${probe.label}: ${role} expected deny, got ${status} — POSSIBLE PRIVILEGE ESCALATION`);
      }
    }
  }
  assert.deepEqual(failures, [], `RBAC matrix violations:\n${failures.join("\n")}`);

  await t.test("documents.delete: only roles with documents.delete can delete (fresh doc per attempt)", async () => {
    for (const role of ["Viewer", "Member", "Editor", "Manager", "Admin"] as RoleName[]) {
      const docId = await uploadDoc(adminCookies, org);
      const status = (await inject("DELETE", `/api/v1/organizations/${org}/documents/${docId}`, roleCookies[role])).statusCode;
      const shouldAllow = role === "Admin" || role === "Manager" || role === "Editor";
      if (shouldAllow) assert.equal(status, 204, `${role} delete -> ${status}`);
      else assert.equal(status, 403, `${role} delete -> ${status}`);
    }
  });

  await t.test("users.delete: only Admin can remove members", async () => {
    for (const role of ["Viewer", "Member", "Editor", "Manager", "Admin"] as RoleName[]) {
      const temp = await inject("POST", `/api/v1/organizations/${org}/users`, adminCookies, { name: "Delete Me", email: `del-${marker}-${role.toLowerCase()}@example.com`, password: "DeleteMe12345", role: "Member" });
      assert.equal(temp.statusCode, 201);
      const status = (await inject("DELETE", `/api/v1/organizations/${org}/users/${temp.json().id}`, roleCookies[role])).statusCode;
      if (role === "Admin") assert.equal(status, 204);
      else assert.equal(status, 403, `${role} delete user -> ${status}`);
    }
  });

  await t.test("private sites: only sites.manage roles (Admin/Manager) or site members can see or delete them", async () => {
    for (const role of ["Viewer", "Member", "Editor", "Manager", "Admin"] as RoleName[]) {
      const created = await inject("POST", `/api/v1/organizations/${org}/sites`, adminCookies, { name: `Private ${role}`, visibility: "PRIVATE" });
      assert.equal(created.statusCode, 201, created.body);
      const siteId = (created.json().site ?? created.json()).id as string;
      const elevated = role === "Admin" || role === "Manager";

      const listed = await inject("GET", `/api/v1/organizations/${org}/sites`, roleCookies[role]);
      assert.equal(listed.statusCode, 200);
      const sees = ((listed.json().sites ?? listed.json()) as Array<{ id: string }>).some((site) => site.id === siteId);
      assert.equal(sees, elevated, `${role} sees private site -> ${sees}`);

      const read = await inject("GET", `/api/v1/organizations/${org}/sites/${siteId}`, roleCookies[role]);
      assert.equal(read.statusCode, elevated ? 200 : 403, `${role} read private site -> ${read.statusCode}`);

      const removed = await inject("DELETE", `/api/v1/organizations/${org}/sites/${siteId}`, roleCookies[role]);
      assert.equal(removed.statusCode, elevated ? 204 : 403, `${role} delete private site -> ${removed.statusCode}`);
    }
  });
});
