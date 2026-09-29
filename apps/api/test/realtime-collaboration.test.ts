import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { RealtimeEventDto } from "@nexora/contracts";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  enterPresence,
  getPresence,
  publishMemberEvent,
  publishResourceEvent,
  resetRealtimeState,
  subscribeMemberChannel,
  subscribeResourceChannel
} from "../src/modules/collaboration/realtime.service.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `rt-admin-${marker}@example.com`;
const memberEmail = `rt-member-${marker}@example.com`;
const foreignAdminEmail = `rt-foreign-admin-${marker}@example.com`;
const foreignMemberEmail = `rt-foreign-member-${marker}@example.com`;
const organizationIds: string[] = [];

before(async () => app.ready());
beforeEach(() => resetRealtimeState());

after(async () => {
  resetRealtimeState();
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, memberEmail, foreignAdminEmail, foreignMemberEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

test("member events are isolated by tenant and membership", () => {
  const received: RealtimeEventDto[] = [];
  const unsubscribe = subscribeMemberChannel("t1", "m1", (event) => received.push(event));
  publishMemberEvent("t1", "m1", "notification.created");
  publishMemberEvent("t1", "m2", "notification.created");
  publishMemberEvent("t2", "m1", "notification.created");
  assert.equal(received.length, 1);
  assert.equal(received[0]!.type, "notification.created");
  assert.ok(received[0]!.id);
  assert.ok(!Number.isNaN(Date.parse(received[0]!.occurredAt)));
  unsubscribe();
  publishMemberEvent("t1", "m1", "notification.updated");
  assert.equal(received.length, 1);
});

test("resource events are isolated by tenant, type and id", () => {
  const received: RealtimeEventDto[] = [];
  subscribeResourceChannel("t1", "task", "task-1", (event) => received.push(event));
  publishResourceEvent("t1", "task", "task-1", "comment.created", { userId: "u1", name: "Ana", avatar: null });
  publishResourceEvent("t1", "task", "task-2", "comment.created");
  publishResourceEvent("t1", "document", "task-1", "comment.created");
  publishResourceEvent("t2", "task", "task-1", "comment.created");
  assert.equal(received.length, 1);
  assert.equal(received[0]!.type, "comment.created");
  assert.equal(received[0]!.resourceType, "task");
  assert.equal(received[0]!.resourceId, "task-1");
  assert.deepEqual(received[0]!.actor, { userId: "u1", name: "Ana", avatar: null });
});

test("a throwing listener is pruned and other listeners keep receiving events", () => {
  const received: RealtimeEventDto[] = [];
  subscribeResourceChannel("t1", "task", "task-1", () => {
    throw new Error("closed stream");
  });
  subscribeResourceChannel("t1", "task", "task-1", (event) => received.push(event));
  publishResourceEvent("t1", "task", "task-1", "resource.updated");
  assert.equal(received.length, 1);
  publishResourceEvent("t1", "task", "task-1", "resource.updated");
  assert.equal(received.length, 2);
});

test("presence dedupes per membership and removes only after the final connection cleanup", () => {
  const events: RealtimeEventDto[] = [];
  subscribeResourceChannel("t1", "document", "doc-1", (event) => events.push(event));
  const info = { membershipId: "m1", userId: "u1", name: "Ana", avatar: null };

  const firstLeave = enterPresence("t1", "document", "doc-1", info);
  assert.deepEqual(
    getPresence("t1", "document", "doc-1").map((p) => p.membershipId),
    ["m1"]
  );
  const secondLeave = enterPresence("t1", "document", "doc-1", info);
  assert.equal(getPresence("t1", "document", "doc-1").length, 1);
  assert.equal(events.filter((event) => event.type === "presence.updated").length, 2);

  firstLeave();
  assert.equal(getPresence("t1", "document", "doc-1").length, 1);
  secondLeave();
  assert.equal(getPresence("t1", "document", "doc-1").length, 0);
  secondLeave();
  assert.equal(getPresence("t1", "document", "doc-1").length, 0);
});

test("presence is tenant isolated and reset clears all state", () => {
  enterPresence("t1", "task", "x", { membershipId: "m1", userId: "u1", name: "Ana", avatar: null });
  enterPresence("t2", "task", "x", { membershipId: "m2", userId: "u2", name: "Bruno", avatar: null });
  assert.equal(getPresence("t1", "task", "x")[0]!.membershipId, "m1");
  assert.equal(getPresence("t2", "task", "x")[0]!.membershipId, "m2");

  const received: RealtimeEventDto[] = [];
  subscribeResourceChannel("t1", "task", "x", (event) => received.push(event));
  resetRealtimeState();
  publishResourceEvent("t1", "task", "x", "resource.updated");
  assert.equal(received.length, 0);
  assert.equal(getPresence("t1", "task", "x").length, 0);
  enterPresence("t1", "task", "x", { membershipId: "m9", userId: "u9", name: "Carla", avatar: null });
  assert.equal(getPresence("t1", "task", "x").length, 1);
});

test("collaboration members endpoint returns only active same-tenant members", async () => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "RT Admin", email: adminEmail, password: "RealtimePassword123", organizationName: "RT Organization" } });
  assert.equal(registration.statusCode, 201);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  const addMember = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Zeta Member", email: memberEmail, password: "RealtimePassword123", role: "Member" } });
  assert.equal(addMember.statusCode, 201, addMember.body);

  const foreignRegistration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Foreign Admin", email: foreignAdminEmail, password: "RealtimePassword123", organizationName: "Foreign Organization" } });
  assert.equal(foreignRegistration.statusCode, 201);
  const foreignOrganizationId = foreignRegistration.json().organizations[0].id as string;
  organizationIds.push(foreignOrganizationId);
  const foreignCookies = cookies(foreignRegistration);
  const addForeign = await app.inject({ method: "POST", url: `/api/v1/organizations/${foreignOrganizationId}/users`, headers: { cookie: foreignCookies }, payload: { name: "Zeta Foreign", email: foreignMemberEmail, password: "RealtimePassword123", role: "Member" } });
  assert.equal(addForeign.statusCode, 201, addForeign.body);

  const unauthenticated = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/collaboration/members` });
  assert.equal(unauthenticated.statusCode, 401);

  const list = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/collaboration/members`, headers: { cookie: adminCookies } });
  assert.equal(list.statusCode, 200, list.body);
  const members = list.json().members as Array<{ membershipId: string; userId: string; name: string; avatar: string | null }>;
  const names = members.map((member) => member.name);
  assert.ok(names.includes("RT Admin"));
  assert.ok(names.includes("Zeta Member"));
  assert.ok(!names.includes("Zeta Foreign"));
  assert.ok(!names.includes("Foreign Admin"));
  assert.ok(members.every((member) => member.membershipId && member.userId));

  const search = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/collaboration/members?q=zeta`, headers: { cookie: adminCookies } });
  assert.equal(search.statusCode, 200);
  assert.deepEqual(search.json().members.map((member: { name: string }) => member.name), ["Zeta Member"]);

  const foreignList = await app.inject({ method: "GET", url: `/api/v1/organizations/${foreignOrganizationId}/collaboration/members`, headers: { cookie: foreignCookies } });
  assert.equal(foreignList.statusCode, 200);
  const foreignNames = foreignList.json().members.map((member: { name: string }) => member.name);
  assert.ok(foreignNames.includes("Zeta Foreign"));
  assert.ok(!foreignNames.includes("Zeta Member"));
});
