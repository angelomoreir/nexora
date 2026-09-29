import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ownerEmail = `dashboard-owner-${marker}@example.com`;
const otherEmail = `dashboard-other-${marker}@example.com`;
const organizationIds: string[] = [];

function cookieHeader(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  const cookies = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  return cookies.map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => {
  await app.ready();
});

after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, otherEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("dashboard returns real organization-scoped aggregates and recent data", async () => {
  const registration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      name: "Dashboard Owner",
      email: ownerEmail,
      password: "DashboardPassword123",
      organizationName: "Dashboard Organization"
    }
  });
  assert.equal(registration.statusCode, 201);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const cookies = cookieHeader(registration);
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const membership = await prisma.organizationMember.findUniqueOrThrow({
    where: { tenantId_userId: { tenantId: organizationId, userId: owner.id } }
  });

  const folder = await prisma.folder.create({ data: { tenantId: organizationId, name: "Finance" } });
  const document = await prisma.document.create({
    data: { tenantId: organizationId, folderId: folder.id, name: "Report.pdf", createdById: owner.id }
  });
  await prisma.documentVersion.create({
    data: {
      tenantId: organizationId,
      documentId: document.id,
      version: 1,
      storageKey: `${organizationId}/${document.id}/1`,
      originalName: "Report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      checksum: "test-checksum",
      createdById: owner.id
    }
  });
  await prisma.team.create({ data: { tenantId: organizationId, name: "Operations" } });
  await prisma.task.createMany({
    data: [
      { tenantId: organizationId, title: "Pending task", assignedMembershipId: membership.id, createdById: owner.id },
      { tenantId: organizationId, title: "Completed task", status: "DONE", assignedMembershipId: membership.id, createdById: owner.id }
    ]
  });
  await prisma.processDefinition.create({ data: { tenantId: organizationId, name: "Active process", status: "ACTIVE" } });
  const workflow = await prisma.workflowDefinition.create({
    data: { tenantId: organizationId, name: "Approval workflow", definitionJson: "{}", status: "ACTIVE" }
  });
  const workflowInstance = await prisma.workflowInstance.create({
    data: { tenantId: organizationId, workflowDefinitionId: workflow.id, startedById: membership.id }
  });
  await prisma.approval.create({
    data: { tenantId: organizationId, workflowInstanceId: workflowInstance.id, approverId: membership.id }
  });
  await prisma.notification.create({
    data: { tenantId: organizationId, recipientId: membership.id, type: "TASK", title: "New task", body: "A task was assigned." }
  });
  await prisma.auditLog.create({
    data: {
      tenantId: organizationId,
      actorId: membership.id,
      action: "document.updated",
      resourceType: "Document",
      resourceId: document.id
    }
  });

  const response = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${organizationId}/dashboard`,
    headers: { cookie: cookies }
  });
  assert.equal(response.statusCode, 200);
  const dashboard = response.json();
  assert.deepEqual(dashboard.metrics, {
    documents: 1,
    users: 1,
    teams: 1,
    pendingTasks: 1,
    activeProcesses: 1,
    pendingApprovals: 1,
    storageBytes: 2048,
    tasks: 2,
    lists: 0,
    forms: 0
  });
  assert.equal(dashboard.recentDocuments[0].name, "Report.pdf");
  assert.equal(dashboard.recentDocuments[0].latestVersion.sizeBytes, 2048);
  assert.deepEqual(dashboard.pendingTasks.map((task: { title: string }) => task.title), ["Pending task"]);
  assert.equal(dashboard.notifications[0].title, "New task");
  assert.equal(dashboard.recentActivity[0].action, "document.updated");
  assert.deepEqual(
    dashboard.taskDistribution.map((group: { status: string; count: number }) => [group.status, group.count]),
    [["DONE", 1], ["TODO", 1]]
  );

  const otherRegistration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      name: "Other Owner",
      email: otherEmail,
      password: "OtherDashboardPassword123",
      organizationName: "Other Dashboard Organization"
    }
  });
  assert.equal(otherRegistration.statusCode, 201);
  const otherOrganizationId = otherRegistration.json().organizations[0].id as string;
  organizationIds.push(otherOrganizationId);
  const forbidden = await app.inject({
    method: "GET",
    url: `/api/v1/organizations/${otherOrganizationId}/dashboard`,
    headers: { cookie: cookies }
  });
  assert.equal(forbidden.statusCode, 403);
});
