import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `feat-admin-${marker}@example.com`;
const memberEmail = `feat-member-${marker}@example.com`;
const organizationIds: string[] = [];

let organizationId = "";
let adminCookies = "";
let memberCookies = "";
let adminMembershipId = "";
let memberMembershipId = "";

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

async function multipart(filename: string, mimeType: string, content: Uint8Array, path?: string) {
  const form = new FormData();
  if (path) form.append("path", path);
  form.append("file", new Blob([Uint8Array.from(content).buffer], { type: mimeType }), filename);
  const request = new Request("http://localhost", { method: "POST", body: form });
  return { payload: Buffer.from(await request.arrayBuffer()), contentType: request.headers.get("content-type")! };
}

async function uploadText(cookie: string, name: string, content: string, folderId?: string, path?: string) {
  const body = await multipart(name, "text/plain", new TextEncoder().encode(content), path);
  const response = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents${folderId ? `?folderId=${folderId}` : ""}`, headers: { cookie, "content-type": body.contentType }, payload: body.payload });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().document;
}

before(async () => {
  await app.ready();
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Feat Admin", email: adminEmail, password: "FeatPassword123", organizationName: "Feat Organization" } });
  assert.equal(registration.statusCode, 201);
  organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  adminCookies = cookies(registration);
  adminMembershipId = (await prisma.organizationMember.findFirstOrThrow({ where: { tenantId: organizationId, user: { email: adminEmail } } })).id;

  const createMember = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Feat Member", email: memberEmail, password: "MemberPassword123", role: "Member" } });
  assert.equal(createMember.statusCode, 201, createMember.body);
  memberMembershipId = createMember.json().memberId as string;
  const memberLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: memberEmail, password: "MemberPassword123" } });
  assert.equal(memberLogin.statusCode, 200);
  memberCookies = cookies(memberLogin);
});

after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, memberEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("upload with path creates the intermediate folder chain", async () => {
  const filename = `patched-${marker}.txt`;
  const document = await uploadText(adminCookies, filename, `path upload ${marker}`, undefined, `clientes-${marker}/acme/contratos/${filename}`);
  assert.ok(document.folderId);

  const deepest = await prisma.folder.findUniqueOrThrow({ where: { id: document.folderId } });
  assert.equal(deepest.name, "contratos");
  const middle = await prisma.folder.findUniqueOrThrow({ where: { id: deepest.parentId! } });
  assert.equal(middle.name, "acme");
  const top = await prisma.folder.findUniqueOrThrow({ where: { id: middle.parentId! } });
  assert.equal(top.name, `clientes-${marker}`);
  assert.equal(top.parentId, null);

  // Re-uploading through the same path reuses the existing folders
  const second = await uploadText(adminCookies, `patched2-${marker}.txt`, "second", undefined, `clientes-${marker}/acme/contratos/patched2-${marker}.txt`);
  assert.equal(second.folderId, deepest.id);

  // The folder chain is visible in the documents listing
  const listing = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents?folderId=${deepest.id}`, headers: { cookie: adminCookies } });
  assert.equal(listing.statusCode, 200);
  assert.ok(listing.json().documents.some((item: { id: string }) => item.id === document.id));
});

test("saved views: create, list (own + shared), update and delete", async () => {
  const create = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/views`, headers: { cookie: adminCookies }, payload: { resourceType: "tasks", name: `My tasks ${marker}`, config: { filters: { status: "TODO" }, sort: "dueAt" }, isShared: true } });
  assert.equal(create.statusCode, 201, create.body);
  const view = create.json();
  assert.equal(view.name, `My tasks ${marker}`);
  assert.equal(view.isShared, true);
  assert.deepEqual(view.config, { filters: { status: "TODO" }, sort: "dueAt" });

  // Admin sees own views; member sees shared views
  const adminList = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/views?resourceType=tasks`, headers: { cookie: adminCookies } });
  assert.equal(adminList.statusCode, 200);
  assert.ok(adminList.json().views.some((item: { id: string }) => item.id === view.id));
  const memberList = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/views?resourceType=tasks`, headers: { cookie: memberCookies } });
  assert.equal(memberList.statusCode, 200);
  assert.ok(memberList.json().views.some((item: { id: string }) => item.id === view.id));

  // Members cannot update someone else's view
  const memberPatch = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/views/${view.id}`, headers: { cookie: memberCookies }, payload: { name: "hijack" } });
  assert.equal(memberPatch.statusCode, 403);

  // Owner can update
  const patch = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/views/${view.id}`, headers: { cookie: adminCookies }, payload: { name: `Renamed ${marker}`, config: { viewMode: "kanban" } } });
  assert.equal(patch.statusCode, 200, patch.body);
  assert.equal(patch.json().name, `Renamed ${marker}`);
  assert.deepEqual(patch.json().config, { viewMode: "kanban" });

  // Members can manage their own views
  const memberView = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/views`, headers: { cookie: memberCookies }, payload: { resourceType: "documents", name: "mine", config: {} } });
  assert.equal(memberView.statusCode, 201);
  const memberDelete = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/views/${memberView.json().id}`, headers: { cookie: memberCookies } });
  assert.equal(memberDelete.statusCode, 204);

  const remove = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/views/${view.id}`, headers: { cookie: adminCookies } });
  assert.equal(remove.statusCode, 204);
  const afterDelete = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/views?resourceType=tasks`, headers: { cookie: adminCookies } });
  assert.equal(afterDelete.json().views.some((item: { id: string }) => item.id === view.id), false);
});

test("subscriptions: subscribers are alerted, the actor is not", async () => {
  const createFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: adminCookies }, payload: { name: `Watched-${marker}` } });
  assert.equal(createFolder.statusCode, 201);
  const folderId = createFolder.json().id as string;

  // Member subscribes to "created" events on the folder; admin subscribes too (to verify actor skip)
  const memberSub = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/subscriptions`, headers: { cookie: memberCookies }, payload: { targetType: "folder", targetId: folderId, events: ["created", "deleted"] } });
  assert.equal(memberSub.statusCode, 201, memberSub.body);
  assert.equal(memberSub.json().targetType, "folder");
  assert.deepEqual(memberSub.json().events, ["created", "deleted"]);
  const adminSub = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/subscriptions`, headers: { cookie: adminCookies }, payload: { targetType: "folder", targetId: folderId, events: ["created"] } });
  assert.equal(adminSub.statusCode, 201);

  const check = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/subscriptions/check?targetType=folder&targetId=${folderId}`, headers: { cookie: memberCookies } });
  assert.equal(check.statusCode, 200);
  assert.equal(check.json().subscribed, true);
  const mine = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/subscriptions/mine`, headers: { cookie: memberCookies } });
  assert.equal(mine.statusCode, 200);
  assert.ok(mine.json().subscriptions.some((item: { targetId: string }) => item.targetId === folderId));

  // Admin uploads a document into the watched folder
  await uploadText(adminCookies, `alert-${marker}.txt`, `alert ${marker}`, folderId);

  const memberNotification = await prisma.notification.findFirst({ where: { tenantId: organizationId, recipientId: memberMembershipId, type: "subscription.alert" } });
  assert.ok(memberNotification);
  const data = JSON.parse(memberNotification.dataJson!) as { targetType: string; targetId: string; event: string };
  assert.equal(data.targetType, "folder");
  assert.equal(data.targetId, folderId);
  assert.equal(data.event, "created");

  // The actor (admin) must NOT receive a subscription alert for their own action
  const adminNotification = await prisma.notification.findFirst({ where: { tenantId: organizationId, recipientId: adminMembershipId, type: "subscription.alert" } });
  assert.equal(adminNotification, null);

  // Unsubscribe removes the alert channel
  const unsubscribe = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/subscriptions`, headers: { cookie: memberCookies }, payload: { targetType: "folder", targetId: folderId } });
  assert.equal(unsubscribe.statusCode, 204);
  const removed = await prisma.notification.count({ where: { tenantId: organizationId, recipientId: memberMembershipId, type: "subscription.alert" } });
  await uploadText(adminCookies, `alert2-${marker}.txt`, "second", folderId);
  const after = await prisma.notification.count({ where: { tenantId: organizationId, recipientId: memberMembershipId, type: "subscription.alert" } });
  assert.equal(after, removed);
});

test("templates: flag document/folder, list templates and instantiate copies", async () => {
  const source = await uploadText(adminCookies, `tpl-${marker}.txt`, `template body ${marker}`);

  const flag = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${source.id}/template`, headers: { cookie: adminCookies }, payload: { isTemplate: true } });
  assert.equal(flag.statusCode, 200, flag.body);
  assert.equal(flag.json().document.isTemplate, true);

  const createFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: adminCookies }, payload: { name: `TplFolder-${marker}` } });
  const folderId = createFolder.json().id as string;
  await uploadText(adminCookies, `tpl-inner-${marker}.txt`, "inner content", folderId);
  const flagFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders/${folderId}/template`, headers: { cookie: adminCookies }, payload: { isTemplate: true } });
  assert.equal(flagFolder.statusCode, 200, flagFolder.body);
  assert.equal(flagFolder.json().isTemplate, true);

  const templates = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/templates`, headers: { cookie: adminCookies } });
  assert.equal(templates.statusCode, 200);
  assert.ok(templates.json().documents.some((item: { id: string }) => item.id === source.id));
  assert.ok(templates.json().folders.some((item: { id: string }) => item.id === folderId));

  // Instantiate the document template
  const instance = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/templates/${source.id}/instantiate`, headers: { cookie: adminCookies }, payload: { name: `inst-${marker}.txt` } });
  assert.equal(instance.statusCode, 201, instance.body);
  const newDoc = instance.json().document;
  assert.equal(newDoc.name, `inst-${marker}.txt`);
  assert.equal(newDoc.isTemplate, false);
  const download = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/${newDoc.id}/download`, headers: { cookie: adminCookies } });
  assert.equal(download.statusCode, 200);
  assert.equal(download.body, `template body ${marker}`);

  // Instantiating a non-template document fails
  const notTemplate = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/templates/${newDoc.id}/instantiate`, headers: { cookie: adminCookies }, payload: {} });
  assert.equal(notTemplate.statusCode, 400);

  // Instantiate the folder template — deep-copies the subtree
  const folderInstance = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders/templates/${folderId}/instantiate`, headers: { cookie: adminCookies }, payload: { name: `TplCopy-${marker}` } });
  assert.equal(folderInstance.statusCode, 201, folderInstance.body);
  const copiedFolderId = folderInstance.json().id as string;
  assert.equal(folderInstance.json().name, `TplCopy-${marker}`);
  assert.equal(folderInstance.json().isTemplate, false);
  const innerListing = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents?folderId=${copiedFolderId}`, headers: { cookie: adminCookies } });
  assert.equal(innerListing.statusCode, 200);
  assert.ok(innerListing.json().documents.some((item: { name: string }) => item.name === `tpl-inner-${marker}.txt`));
});

test("dashboards: CRUD, widgets and render with resolved data", async () => {
  const create = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/dashboards`, headers: { cookie: adminCookies }, payload: { name: `Ops ${marker}` } });
  assert.equal(create.statusCode, 201, create.body);
  const dashboard = create.json();
  assert.equal(dashboard.name, `Ops ${marker}`);
  assert.deepEqual(dashboard.widgets, []);

  // Unique name per tenant
  const duplicate = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/dashboards`, headers: { cookie: adminCookies }, payload: { name: `Ops ${marker}` } });
  assert.equal(duplicate.statusCode, 409);

  // Members without dashboards.manage cannot create dashboards
  const memberCreate = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/dashboards`, headers: { cookie: memberCookies }, payload: { name: "member dash" } });
  assert.equal(memberCreate.statusCode, 403);

  const addMetrics = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/dashboards/${dashboard.id}/widgets`, headers: { cookie: adminCookies }, payload: { type: "metrics", position: { x: 0, y: 0, w: 4, h: 2 } } });
  assert.equal(addMetrics.statusCode, 201, addMetrics.body);
  const metricsWidget = addMetrics.json();
  assert.equal(metricsWidget.type, "metrics");
  assert.deepEqual(metricsWidget.position, { x: 0, y: 0, w: 4, h: 2 });

  const addTasks = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/dashboards/${dashboard.id}/widgets`, headers: { cookie: adminCookies }, payload: { type: "pendingTasks", config: { limit: 3 } } });
  assert.equal(addTasks.statusCode, 201);

  const invalidType = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/dashboards/${dashboard.id}/widgets`, headers: { cookie: adminCookies }, payload: { type: "bogus" } });
  assert.equal(invalidType.statusCode, 400);

  // Render resolves widget data
  const render = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/dashboards/${dashboard.id}/render`, headers: { cookie: memberCookies } });
  assert.equal(render.statusCode, 200, render.body);
  assert.equal(render.json().dashboard.id, dashboard.id);
  const rendered = render.json().widgets as Array<{ id: string; type: string; data: unknown }>;
  assert.equal(rendered.length, 2);
  const metrics = rendered.find((widget) => widget.type === "metrics");
  assert.ok(metrics);
  assert.equal(typeof (metrics!.data as { documents: number }).documents, "number");
  const tasks = rendered.find((widget) => widget.type === "pendingTasks");
  assert.ok(tasks);
  assert.ok(Array.isArray(tasks!.data));

  // Update and remove widget
  const updateWidget = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/dashboards/${dashboard.id}/widgets/${metricsWidget.id}`, headers: { cookie: adminCookies }, payload: { position: { x: 1, y: 1, w: 6, h: 3 } } });
  assert.equal(updateWidget.statusCode, 200);
  assert.deepEqual(updateWidget.json().position, { x: 1, y: 1, w: 6, h: 3 });
  const removeWidget = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/dashboards/${dashboard.id}/widgets/${metricsWidget.id}`, headers: { cookie: adminCookies } });
  assert.equal(removeWidget.statusCode, 204);

  // List + delete
  const list = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/dashboards`, headers: { cookie: adminCookies } });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().dashboards.some((item: { id: string }) => item.id === dashboard.id));
  const remove = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/dashboards/${dashboard.id}`, headers: { cookie: adminCookies } });
  assert.equal(remove.statusCode, 204);
});
