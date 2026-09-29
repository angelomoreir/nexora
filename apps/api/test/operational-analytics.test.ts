import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `analytics-admin-${marker}@example.com`;
const memberEmail = `analytics-member-${marker}@example.com`;
const viewerEmail = `analytics-viewer-${marker}@example.com`;
const otherEmail = `analytics-other-${marker}@example.com`;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

function ago(days: number, hours = 0) {
  return new Date(Date.now() - (days * 24 + hours) * 3_600_000);
}

before(async () => app.ready());

after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, memberEmail, viewerEmail, otherEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("operational analytics returns exact tenant-scoped period metrics", async () => {
  const registration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Analytics Admin", email: adminEmail, password: "AnalyticsPassword123", organizationName: "Analytics Organization" }
  });
  assert.equal(registration.statusCode, 201, registration.body);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  const adminMembership = await prisma.organizationMember.findUniqueOrThrow({ where: { tenantId_userId: { tenantId: organizationId, userId: adminUser.id } } });

  const addMember = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Analytics Member", email: memberEmail, password: "AnalyticsPassword123", role: "Member" } });
  assert.equal(addMember.statusCode, 201, addMember.body);
  const memberMembershipId = addMember.json().memberId as string;

  const addViewer = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "Analytics Viewer", email: viewerEmail, password: "AnalyticsPassword123", role: "Viewer" } });
  assert.equal(addViewer.statusCode, 201, addViewer.body);
  const viewerLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: viewerEmail, password: "AnalyticsPassword123" } });
  const viewerCookies = cookies(viewerLogin);

  await prisma.document.createMany({
    data: [
      { tenantId: organizationId, name: "Current A.txt", createdById: adminUser.id, createdAt: ago(1) },
      { tenantId: organizationId, name: "Current B.txt", createdById: adminUser.id, createdAt: ago(10) },
      { tenantId: organizationId, name: "Old.txt", createdById: adminUser.id, createdAt: ago(45) }
    ]
  });

  await prisma.task.createMany({
    data: [
      { tenantId: organizationId, title: "Completed recent", status: "DONE", completedAt: ago(2), createdAt: ago(40), createdById: adminUser.id },
      { tenantId: organizationId, title: "Overdue", status: "TODO", dueAt: ago(1), createdAt: ago(1), createdById: adminUser.id },
      { tenantId: organizationId, title: "In progress", status: "IN_PROGRESS", createdAt: ago(40), createdById: adminUser.id },
      { tenantId: organizationId, title: "Cancelled", status: "CANCELLED", createdAt: ago(3), createdById: adminUser.id },
      { tenantId: organizationId, title: "Completed old", status: "DONE", completedAt: ago(100), createdAt: ago(110), createdById: adminUser.id }
    ]
  });

  const workflowA = await prisma.workflowDefinition.create({ data: { tenantId: organizationId, name: "Flow A", definitionJson: "{}", createdById: adminUser.id } });
  const workflowB = await prisma.workflowDefinition.create({ data: { tenantId: organizationId, name: "Flow B", definitionJson: "{}", createdById: adminUser.id } });
  const completedInstance = await prisma.workflowInstance.create({ data: { tenantId: organizationId, workflowDefinitionId: workflowA.id, startedById: adminMembership.id, status: "COMPLETED", startedAt: ago(1, 2), completedAt: ago(1, 1) } });
  const failedInstance = await prisma.workflowInstance.create({ data: { tenantId: organizationId, workflowDefinitionId: workflowA.id, startedById: adminMembership.id, status: "FAILED", startedAt: ago(2, 5), completedAt: ago(2, 2) } });
  await prisma.workflowInstance.create({ data: { tenantId: organizationId, workflowDefinitionId: workflowB.id, startedById: adminMembership.id, status: "RUNNING", startedAt: ago(0, 1) } });

  await prisma.approval.createMany({
    data: [
      { tenantId: organizationId, workflowInstanceId: completedInstance.id, approverId: adminMembership.id, status: "APPROVED", createdAt: ago(1, 4), decidedAt: ago(1, 2) },
      { tenantId: organizationId, workflowInstanceId: failedInstance.id, approverId: adminMembership.id, status: "REJECTED", createdAt: ago(2, 6), decidedAt: ago(2, 2) },
      { tenantId: organizationId, workflowInstanceId: failedInstance.id, approverId: adminMembership.id, status: "PENDING", createdAt: ago(1) }
    ]
  });

  await prisma.auditLog.createMany({
    data: [
      { tenantId: organizationId, actorId: adminMembership.id, action: "document.viewed", resourceType: "Document", occurredAt: ago(1) },
      { tenantId: organizationId, actorId: adminMembership.id, action: "document.updated", resourceType: "Document", occurredAt: ago(2) },
      { tenantId: organizationId, actorId: memberMembershipId, action: "task.updated", resourceType: "Task", occurredAt: ago(1) }
    ]
  });

  const response = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/analytics/operational?days=30`, headers: { cookie: adminCookies } });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.period.days, 30);
  assert.equal(body.period.timezone, "UTC");
  assert.equal(body.summary.documentsCreated, 2);
  assert.equal(body.summary.tasksCreated, 2);
  assert.equal(body.summary.tasksCompleted, 1);
  assert.equal(body.summary.overdueTasks, 1);
  assert.equal(body.summary.currentTaskCompletionRatio, 50);
  assert.equal(body.summary.avgApprovalHours, 3);
  assert.equal(body.summary.workflowRuns, 3);
  assert.equal(body.summary.workflowSuccessRate, 50);
  assert.ok(body.summary.activeUsers >= 2);
  assert.deepEqual(body.approvalOutcomes, { pending: 1, approved: 1, rejected: 1 });
  assert.equal(body.trend.length, 30);
  assert.equal(body.trend.reduce((sum: number, day: { documentsCreated: number }) => sum + day.documentsCreated, 0), 2);
  assert.equal(body.trend.reduce((sum: number, day: { tasksCompleted: number }) => sum + day.tasksCompleted, 0), 1);
  const flowA = body.workflowPerformance.find((workflow: { workflowName: string }) => workflow.workflowName === "Flow A");
  assert.deepEqual(flowA, { workflowId: workflowA.id, workflowName: "Flow A", runs: 2, completed: 1, failed: 1, successRate: 50, avgDurationHours: 2 });
  const flowB = body.workflowPerformance.find((workflow: { workflowName: string }) => workflow.workflowName === "Flow B");
  assert.equal(flowB.runs, 1);
  assert.equal(flowB.successRate, null);
  assert.ok(body.adoption.some((entry: { resourceType: string; actions: number }) => entry.resourceType === "Document" && entry.actions >= 2));
  assert.ok(body.adoption.some((entry: { resourceType: string; actions: number }) => entry.resourceType === "Task" && entry.actions >= 1));

  const invalid = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/analytics/operational?days=14`, headers: { cookie: adminCookies } });
  assert.equal(invalid.statusCode, 400);
  const denied = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/analytics/operational`, headers: { cookie: viewerCookies } });
  assert.equal(denied.statusCode, 403);

  const otherRegistration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "Other Analytics", email: otherEmail, password: "AnalyticsPassword123", organizationName: "Other Analytics Organization" } });
  assert.equal(otherRegistration.statusCode, 201, otherRegistration.body);
  const otherOrganizationId = otherRegistration.json().organizations[0].id as string;
  organizationIds.push(otherOrganizationId);
  const otherResponse = await app.inject({ method: "GET", url: `/api/v1/organizations/${otherOrganizationId}/analytics/operational?days=30`, headers: { cookie: cookies(otherRegistration) } });
  assert.equal(otherResponse.statusCode, 200, otherResponse.body);
  assert.equal(otherResponse.json().summary.documentsCreated, 0);
  assert.equal(otherResponse.json().summary.tasksCreated, 0);
  assert.equal(otherResponse.json().summary.tasksCompleted, 0);

});
