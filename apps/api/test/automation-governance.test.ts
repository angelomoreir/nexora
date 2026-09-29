import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ownerEmail = `auto-owner-${marker}@example.com`;
const memberEmail = `auto-member-${marker}@example.com`;
const foreignEmail = `auto-foreign-${marker}@example.com`;
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

async function uploadDocument(organizationId: string, cookie: string, name: string, content: string, folderId?: string) {
  const body = await multipart(name, content);
  const url = `/api/v1/organizations/${organizationId}/documents${folderId ? `?folderId=${folderId}` : ""}`;
  const upload = await app.inject({ method: "POST", url, headers: { cookie, "content-type": body.contentType }, payload: body.payload });
  assert.equal(upload.statusCode, 201, upload.body);
  return upload.json().document.id as string;
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, memberEmail, foreignEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

let organizationId = "";
let ownerCookies = "";
let memberCookies = "";
let workflowId = "";
let scopedFolderId = "";
let foreignFolderId = "";

test("setup: organization, owner, member and a published workflow", async () => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Auto Owner", email: ownerEmail, password: "OwnerPassword123", organizationName: "Automation Organization" } });
  assert.equal(registration.statusCode, 201, registration.body);
  organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  ownerCookies = cookies(registration);

  const createMember = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: ownerCookies }, payload: { name: "Auto Member", email: memberEmail, password: "MemberPassword123", role: "Member" } });
  assert.equal(createMember.statusCode, 201, createMember.body);
  const memberLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: memberEmail, password: "MemberPassword123" } });
  memberCookies = cookies(memberLogin);

  const workflow = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/workflows`,
    headers: { cookie: ownerCookies },
    payload: { name: "On create", steps: [{ order: 0, type: "START", name: "Start", config: {} }, { order: 1, type: "END", name: "End", config: {} }] }
  });
  assert.equal(workflow.statusCode, 201, workflow.body);
  workflowId = workflow.json().id as string;
  const publish = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${workflowId}/publish`, headers: { cookie: ownerCookies } });
  assert.equal(publish.statusCode, 200, publish.body);
});

test("workflow triggers fire on matching document events and respect folder scope", async () => {
  const folder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: ownerCookies }, payload: { name: `Scoped ${marker}` } });
  assert.equal(folder.statusCode, 201, folder.body);
  const folderId = folder.json().id as string;

  // Org-wide trigger on document.created.
  const trigger = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies }, payload: { workflowDefinitionId: workflowId, event: "document.created", scopeType: "organization" } });
  assert.equal(trigger.statusCode, 201, trigger.body);
  const triggerId = trigger.json().id as string;

  // Folder-scoped trigger on the new folder only.
  const scoped = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies }, payload: { workflowDefinitionId: workflowId, event: "document.created", scopeType: "folder", scopeId: folderId } });
  assert.equal(scoped.statusCode, 201, scoped.body);

  // Uploading at root fires only the org trigger (1 instance).
  await uploadDocument(organizationId, ownerCookies, `root-${marker}.txt`, "root");
  let instances = await prisma.workflowInstance.findMany({ where: { tenantId: organizationId, workflowDefinitionId: workflowId } });
  assert.equal(instances.length, 1);

  // Uploading inside the scoped folder fires both triggers (2 more instances).
  await uploadDocument(organizationId, ownerCookies, `scoped-${marker}.txt`, "scoped", folderId);
  instances = await prisma.workflowInstance.findMany({ where: { tenantId: organizationId, workflowDefinitionId: workflowId } });
  assert.equal(instances.length, 3);

  // Disabling the org trigger stops it; the folder trigger still fires.
  const disable = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/workflow-triggers/${triggerId}`, headers: { cookie: ownerCookies }, payload: { enabled: false } });
  assert.equal(disable.statusCode, 200, disable.body);
  assert.equal(disable.json().enabled, false);

  await uploadDocument(organizationId, ownerCookies, `again-${marker}.txt`, "again", folderId);
  instances = await prisma.workflowInstance.findMany({ where: { tenantId: organizationId, workflowDefinitionId: workflowId } });
  assert.equal(instances.length, 4);

  const list = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies } });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().triggers.length, 2);
  assert.equal(list.json().triggers[0].workflowName, "On create");

  const remove = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/workflow-triggers/${triggerId}`, headers: { cookie: ownerCookies } });
  assert.equal(remove.statusCode, 204);
});

test("quick actions run a workflow on a document with one call", async () => {
  const documentId = await uploadDocument(organizationId, ownerCookies, `qa-${marker}.txt`, "quick action target");

  const action = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/quick-actions`, headers: { cookie: ownerCookies }, payload: { name: "Processar", targetType: "document", workflowDefinitionId: workflowId } });
  assert.equal(action.statusCode, 201, action.body);
  const actionId = action.json().id as string;
  assert.equal(action.json().workflowStatus, "PUBLISHED");

  const list = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/quick-actions?targetType=document`, headers: { cookie: ownerCookies } });
  assert.equal(list.statusCode, 200);
  assert.ok(list.json().actions.some((item: { id: string }) => item.id === actionId));

  const before = await prisma.workflowInstance.count({ where: { tenantId: organizationId, workflowDefinitionId: workflowId } });
  const run = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/quick-actions/${actionId}/run`, headers: { cookie: memberCookies }, payload: { targetId: documentId } });
  assert.equal(run.statusCode, 201, run.body);
  const after = await prisma.workflowInstance.count({ where: { tenantId: organizationId, workflowDefinitionId: workflowId } });
  assert.equal(after, before + 1);
  const context = run.json().context ?? {};
  assert.equal(context.targetId, documentId);

  const remove = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/quick-actions/${actionId}`, headers: { cookie: ownerCookies } });
  assert.equal(remove.statusCode, 204);
});

test("metadata filter narrows the document listing by field value", async () => {
  const folder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: ownerCookies }, payload: { name: `Meta ${marker}` } });
  const folderId = folder.json().id as string;

  const fields = await app.inject({ method: "PUT", url: `/api/v1/organizations/${organizationId}/folders/${folderId}/metadata-fields`, headers: { cookie: ownerCookies }, payload: { fields: [{ name: "Departamento", slug: "departamento", type: "text", required: false, order: 0 }] } });
  assert.equal(fields.statusCode, 200, fields.body);

  const finance = await uploadDocument(organizationId, ownerCookies, `fin-${marker}.txt`, "finance", folderId);
  await uploadDocument(organizationId, ownerCookies, `hr-${marker}.txt`, "hr", folderId);

  const set = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/documents/${finance}/metadata`, headers: { cookie: ownerCookies }, payload: { values: { departamento: "Finance" } } });
  assert.equal(set.statusCode, 200, set.body);

  const filtered = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents?folderId=${folderId}&meta=departamento%3AFinance`, headers: { cookie: ownerCookies } });
  assert.equal(filtered.statusCode, 200, filtered.body);
  const ids = filtered.json().documents.map((doc: { id: string }) => doc.id);
  assert.deepEqual(ids, [finance]);
  assert.ok(filtered.json().metadataFields.some((field: { slug: string }) => field.slug === "departamento"));

  const unfiltered = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents?folderId=${folderId}`, headers: { cookie: ownerCookies } });
  assert.equal(unfiltered.json().documents.length, 2);
});

test("records and legal holds block modification and deletion", async () => {
  const documentId = await uploadDocument(organizationId, ownerCookies, `record-${marker}.txt`, "record content");

  const record = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/record`, headers: { cookie: ownerCookies }, payload: { isRecord: true } });
  assert.equal(record.statusCode, 200, record.body);
  assert.equal(record.json().document.isRecord, true);

  // A record cannot be renamed or deleted.
  const rename = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/documents/${documentId}`, headers: { cookie: ownerCookies }, payload: { name: "renamed.txt" } });
  assert.equal(rename.statusCode, 409);
  const remove = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/documents/${documentId}`, headers: { cookie: ownerCookies } });
  assert.equal(remove.statusCode, 409);

  // Legal hold blocks deletion too and must be lifted before undeclaring.
  const hold = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/legal-hold`, headers: { cookie: ownerCookies }, payload: { legalHold: true, reason: "Litigation" } });
  assert.equal(hold.statusCode, 200, hold.body);
  assert.equal(hold.json().document.legalHold, true);

  const undeclareWithHold = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/record`, headers: { cookie: ownerCookies }, payload: { isRecord: false } });
  assert.equal(undeclareWithHold.statusCode, 409);

  const liftHold = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/legal-hold`, headers: { cookie: ownerCookies }, payload: { legalHold: false } });
  assert.equal(liftHold.statusCode, 200);
  const undeclare = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${documentId}/record`, headers: { cookie: ownerCookies }, payload: { isRecord: false } });
  assert.equal(undeclare.statusCode, 200);

  const removeNow = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/documents/${documentId}`, headers: { cookie: ownerCookies } });
  assert.equal(removeNow.statusCode, 204);
});

test("announcements respect audience targeting and publish windows", async () => {
  // Members cannot manage announcements.
  const denied = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/announcements`, headers: { cookie: memberCookies }, payload: { title: "X", body: "Y" } });
  assert.equal(denied.statusCode, 403);

  const all = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/announcements`, headers: { cookie: ownerCookies }, payload: { title: "Hello all", body: "Org-wide news" } });
  assert.equal(all.statusCode, 201, all.body);

  const team = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/teams`, headers: { cookie: ownerCookies }, payload: { name: `Team ${marker}` } });
  assert.equal(team.statusCode, 201, team.body);
  const teamId = team.json().id as string;

  const teamOnly = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/announcements`, headers: { cookie: ownerCookies }, payload: { title: "Team news", body: "For the team", audience: `TEAM:${teamId}` } });
  assert.equal(teamOnly.statusCode, 201, teamOnly.body);

  const future = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/announcements`, headers: { cookie: ownerCookies }, payload: { title: "Later", body: "Not yet", publishAt: new Date(Date.now() + 86_400_000).toISOString() } });
  assert.equal(future.statusCode, 201);

  // Member sees only the org-wide announcement (not in the team, future one hidden).
  const memberFeed = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/announcements`, headers: { cookie: memberCookies } });
  assert.equal(memberFeed.statusCode, 200, memberFeed.body);
  const titles = memberFeed.json().announcements.map((item: { title: string }) => item.title);
  assert.deepEqual(titles, ["Hello all"]);

  // Managers see everything, including scheduled and team-targeted ones.
  const manageAll = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/announcements?all=true`, headers: { cookie: ownerCookies } });
  assert.equal(manageAll.statusCode, 200);
  assert.equal(manageAll.json().announcements.length, 3);

  const update = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/announcements/${all.json().id}`, headers: { cookie: ownerCookies }, payload: { title: "Hello all (updated)" } });
  assert.equal(update.statusCode, 200);
  const remove = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/announcements/${all.json().id}`, headers: { cookie: ownerCookies } });
  assert.equal(remove.statusCode, 204);
});

test("governance report surfaces public links, duplicates and record counts", async () => {
  const duplicateContent = `duplicate-${marker}`;
  const first = await uploadDocument(organizationId, ownerCookies, `dup-a-${marker}.txt`, duplicateContent);
  await uploadDocument(organizationId, ownerCookies, `dup-b-${marker}.txt`, duplicateContent);

  const link = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/documents/${first}/share-links`, headers: { cookie: ownerCookies }, payload: { expiresInHours: 24, permission: "READ" } });
  assert.equal(link.statusCode, 201, link.body);

  const report = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/governance/report?inactiveDays=90`, headers: { cookie: ownerCookies } });
  assert.equal(report.statusCode, 200, report.body);
  const body = report.json();
  assert.ok(body.publicLinks.some((item: { targetName: string }) => item.targetName === `dup-a-${marker}.txt`));
  const duplicates = body.duplicateDocuments.find((group: { documentIds: string[] }) => group.documentIds.includes(first));
  assert.ok(duplicates, "Expected duplicate checksum group");
  assert.equal(duplicates.names.length, 2);
  assert.equal(typeof body.recordsCount, "number");
  assert.equal(typeof body.legalHoldsCount, "number");

  // Access review lists effective access entries for the document.
  const review = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/access-review/document/${first}`, headers: { cookie: ownerCookies } });
  assert.equal(review.statusCode, 200, review.body);
  assert.equal(review.json().resourceType, "document");
  assert.ok(review.json().entries.some((entry: { access: string }) => entry.access === "owner"));
  assert.equal(review.json().publicLinks.length, 1);
});

test("delta feed returns changed documents with a cursor", async () => {
  const baseline = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/delta`, headers: { cookie: ownerCookies } });
  assert.equal(baseline.statusCode, 200, baseline.body);
  const cursor = baseline.json().cursor as string;

  const documentId = await uploadDocument(organizationId, ownerCookies, `delta-${marker}.txt`, "delta content");

  const next = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/documents/delta?cursor=${encodeURIComponent(cursor)}`, headers: { cookie: ownerCookies } });
  assert.equal(next.statusCode, 200, next.body);
  const entry = next.json().entries.find((item: { resourceId: string }) => item.resourceId === documentId);
  assert.ok(entry, "Expected a delta entry for the new document");
  assert.equal(entry.type, "created");
  assert.equal(entry.resourceType, "document");
});

test("automation resources expose folder breadcrumb paths and list names", async () => {
  const parent = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: ownerCookies }, payload: { name: `Parent ${marker}` } });
  assert.equal(parent.statusCode, 201, parent.body);
  const parentId = parent.json().id as string;
  const child = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/folders`, headers: { cookie: ownerCookies }, payload: { name: `Child ${marker}`, parentId } });
  assert.equal(child.statusCode, 201, child.body);
  scopedFolderId = child.json().id as string;

  const list = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/lists`, headers: { cookie: ownerCookies }, payload: { name: `Automation List ${marker}` } });
  assert.equal(list.statusCode, 201, list.body);
  const listId = list.json().id as string;

  const resources = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/automation-resources`, headers: { cookie: ownerCookies } });
  assert.equal(resources.statusCode, 200, resources.body);
  const body = resources.json();
  const childEntry = body.folders.find((folder: { id: string }) => folder.id === scopedFolderId);
  assert.equal(childEntry.path, `Parent ${marker} / Child ${marker}`);
  assert.ok(body.lists.some((item: { id: string; name: string }) => item.id === listId && item.name === `Automation List ${marker}`));

  // Members are active organization memberships (membership ids, not user ids).
  const memberships = await prisma.organizationMember.findMany({ where: { tenantId: organizationId, status: "ACTIVE" }, include: { user: { select: { name: true } } } });
  assert.ok(memberships.length >= 2);
  for (const membership of memberships) {
    assert.ok(body.members.some((item: { id: string; name: string }) => item.id === membership.id && item.name === membership.user.name), `Expected member ${membership.user.name}`);
  }

  // Members without workflows.manage cannot read automation resources.
  const denied = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/automation-resources`, headers: { cookie: memberCookies } });
  assert.equal(denied.statusCode, 403);

  // A second tenant provides foreign folder ids for cross-tenant checks.
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Foreign Owner", email: foreignEmail, password: "ForeignPassword123", organizationName: "Foreign Org" } });
  assert.equal(registration.statusCode, 201, registration.body);
  const foreignOrgId = registration.json().organizations[0].id as string;
  organizationIds.push(foreignOrgId);
  const foreignCookies = cookies(registration);
  const foreignFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${foreignOrgId}/folders`, headers: { cookie: foreignCookies }, payload: { name: `Foreign ${marker}` } });
  assert.equal(foreignFolder.statusCode, 201, foreignFolder.body);
  foreignFolderId = foreignFolder.json().id as string;
});

test("a trigger targeting a draft workflow is rejected", async () => {
  const draft = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/workflows`,
    headers: { cookie: ownerCookies },
    payload: { name: "Draft only", steps: [{ order: 0, type: "START", name: "Start", config: {} }, { order: 1, type: "END", name: "End", config: {} }] }
  });
  assert.equal(draft.statusCode, 201, draft.body);
  const draftId = draft.json().id as string;
  assert.equal(draft.json().status, "DRAFT");

  const trigger = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies }, payload: { workflowDefinitionId: draftId, event: "document.created", scopeType: "organization" } });
  assert.equal(trigger.statusCode, 404);
  assert.equal(trigger.json().error.code, "WORKFLOW_NOT_FOUND");
});

test("scoped triggers require a valid same-tenant scope resource", async () => {
  const missingFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies }, payload: { workflowDefinitionId: workflowId, event: "document.created", scopeType: "folder" } });
  assert.equal(missingFolder.statusCode, 400);
  assert.equal(missingFolder.json().error.code, "VALIDATION_ERROR");

  const missingList = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies }, payload: { workflowDefinitionId: workflowId, event: "list.item.created", scopeType: "list" } });
  assert.equal(missingList.statusCode, 400);

  const ghostFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies }, payload: { workflowDefinitionId: workflowId, event: "document.created", scopeType: "folder", scopeId: crypto.randomUUID() } });
  assert.equal(ghostFolder.statusCode, 404);

  const foreignFolder = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies }, payload: { workflowDefinitionId: workflowId, event: "document.created", scopeType: "folder", scopeId: foreignFolderId } });
  assert.equal(foreignFolder.statusCode, 404);

  const ghostList = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies }, payload: { workflowDefinitionId: workflowId, event: "list.item.created", scopeType: "list", scopeId: crypto.randomUUID() } });
  assert.equal(ghostList.statusCode, 404);

  // Event/scope pairs that can never fire are rejected even with a valid scope id.
  const mismatch = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies }, payload: { workflowDefinitionId: workflowId, event: "task.created", scopeType: "folder", scopeId: scopedFolderId } });
  assert.equal(mismatch.statusCode, 400);
  assert.equal(mismatch.json().error.code, "VALIDATION_ERROR");
  const listOnDocument = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies }, payload: { workflowDefinitionId: workflowId, event: "document.created", scopeType: "list", scopeId: crypto.randomUUID() } });
  assert.equal(listOnDocument.statusCode, 400);

  // A valid folder scope still works and stores the id.
  const valid = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies }, payload: { workflowDefinitionId: workflowId, event: "document.updated", scopeType: "folder", scopeId: scopedFolderId } });
  assert.equal(valid.statusCode, 201, valid.body);
  assert.equal(valid.json().scopeId, scopedFolderId);
  await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/workflow-triggers/${valid.json().id}`, headers: { cookie: ownerCookies } });
});

test("a failed trigger update leaves the existing trigger unchanged", async () => {
  const created = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies }, payload: { workflowDefinitionId: workflowId, event: "document.updated", scopeType: "organization" } });
  assert.equal(created.statusCode, 201, created.body);
  const triggerId = created.json().id as string;

  const invalid = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/workflow-triggers/${triggerId}`, headers: { cookie: ownerCookies }, payload: { scopeType: "folder", scopeId: crypto.randomUUID() } });
  assert.equal(invalid.statusCode, 404);

  const missingScope = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/workflow-triggers/${triggerId}`, headers: { cookie: ownerCookies }, payload: { scopeType: "folder" } });
  assert.equal(missingScope.statusCode, 400);

  const foreign = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/workflow-triggers/${triggerId}`, headers: { cookie: ownerCookies }, payload: { scopeType: "folder", scopeId: foreignFolderId } });
  assert.equal(foreign.statusCode, 404);

  const list = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies } });
  const current = list.json().triggers.find((item: { id: string }) => item.id === triggerId);
  assert.equal(current.scopeType, "organization");
  assert.equal(current.scopeId, null);
  assert.equal(current.event, "document.updated");
  assert.equal(current.enabled, true);

  // Organization scope updates normalize any supplied scope id back to null.
  const normalize = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/workflow-triggers/${triggerId}`, headers: { cookie: ownerCookies }, payload: { scopeType: "folder", scopeId: scopedFolderId } });
  assert.equal(normalize.statusCode, 200, normalize.body);

  // Switching to an event incompatible with the stored folder scope is rejected and leaves the trigger unchanged.
  const incompatible = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/workflow-triggers/${triggerId}`, headers: { cookie: ownerCookies }, payload: { event: "task.created" } });
  assert.equal(incompatible.statusCode, 400);
  const unchanged = (await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/workflow-triggers`, headers: { cookie: ownerCookies } })).json().triggers.find((item: { id: string }) => item.id === triggerId);
  assert.equal(unchanged.event, "document.updated");
  assert.equal(unchanged.scopeType, "folder");
  assert.equal(unchanged.scopeId, scopedFolderId);

  // Changing event and scope together in one patch is accepted.
  const compatible = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/workflow-triggers/${triggerId}`, headers: { cookie: ownerCookies }, payload: { event: "task.created", scopeType: "organization" } });
  assert.equal(compatible.statusCode, 200, compatible.body);
  assert.equal(compatible.json().event, "task.created");
  assert.equal(compatible.json().scopeType, "organization");
  assert.equal(compatible.json().scopeId, null);

  const back = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/workflow-triggers/${triggerId}`, headers: { cookie: ownerCookies }, payload: { scopeType: "organization", scopeId: scopedFolderId } });
  assert.equal(back.statusCode, 200);
  assert.equal(back.json().scopeType, "organization");
  assert.equal(back.json().scopeId, null);

  await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/workflow-triggers/${triggerId}`, headers: { cookie: ownerCookies } });
});

test("a quick action with a foreign or nonexistent folder scope is rejected", async () => {
  const ghost = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/quick-actions`, headers: { cookie: ownerCookies }, payload: { name: "Ghost scope", targetType: "document", workflowDefinitionId: workflowId, scopeId: crypto.randomUUID() } });
  assert.equal(ghost.statusCode, 404);
  assert.equal(ghost.json().error.code, "FOLDER_NOT_FOUND");

  const foreign = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/quick-actions`, headers: { cookie: ownerCookies }, payload: { name: "Foreign scope", targetType: "document", workflowDefinitionId: workflowId, scopeId: foreignFolderId } });
  assert.equal(foreign.statusCode, 404);
  assert.equal(foreign.json().error.code, "FOLDER_NOT_FOUND");
});
