import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = buildApp();
const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const adminEmail = `wf-admin-${marker}@example.com`;
const approverEmail = `wf-approver-${marker}@example.com`;
const viewerEmail = `wf-viewer-${marker}@example.com`;
const publishEmail = `wf-publish-${marker}@example.com`;
const organizationIds: string[] = [];

function cookies(response: { headers: Record<string, string | string[] | number | undefined> }) {
  const values = response.headers["set-cookie"];
  return (Array.isArray(values) ? values : typeof values === "string" ? [values] : []).map((value) => value.split(";", 1)[0]).join("; ");
}

before(async () => app.ready());
after(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, approverEmail, viewerEmail, publishEmail] } } });
  await app.close();
  await prisma.$disconnect();
});

test("workflows support creation, builder, publishing, execution with approvals, conditions, tasks and history", async () => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "WF Admin", email: adminEmail, password: "WfPassword123", organizationName: "WF Organization" } });
  assert.equal(registration.statusCode, 201);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  // Add an approver (Member role can manage workflows)
  const addApprover = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "WF Approver", email: approverEmail, password: "WfPassword123", role: "Member" } });
  assert.equal(addApprover.statusCode, 201, addApprover.body);
  const approverMembershipId = addApprover.json().memberId as string;

  // Add a viewer
  const addViewer = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/users`, headers: { cookie: adminCookies }, payload: { name: "WF Viewer", email: viewerEmail, password: "WfPassword123", role: "Viewer" } });
  assert.equal(addViewer.statusCode, 201);

  // --- Create a workflow ---
  const createWorkflow = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/workflows`,
    headers: { cookie: adminCookies },
    payload: {
      name: "Pedido de aprovação",
      description: "Workflow de teste",
      steps: [
        { order: 0, type: "START", name: "Iniciar", config: {} },
        { order: 1, type: "CREATE_TASK", name: "Criar tarefa de revisão", config: { title: "Revisar pedido {{input.empresa}}", priority: "HIGH", outputVariable: "taskId" } },
        { order: 2, type: "APPROVAL", name: "Aprovação do gerente", config: { approverId: approverMembershipId, title: "Aprovar pedido" } },
        { order: 3, type: "CONDITION", name: "Aprovado?", config: { variable: "__lastApproval", operator: "equals", value: "APPROVED", jumpToOrder: 4 } },
        { order: 4, type: "CHANGE_STATUS", name: "Marcar como concluída", config: { status: "DONE" } },
        { order: 5, type: "END", name: "Terminar", config: {} }
      ]
    }
  });
  assert.equal(createWorkflow.statusCode, 201, createWorkflow.body);
  const workflow = createWorkflow.json();
  assert.equal(workflow.name, "Pedido de aprovação");
  assert.equal(workflow.status, "DRAFT");
  assert.equal(workflow.steps.length, 6);

  // --- Get workflow ---
  const getWorkflow = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/workflows/${workflow.id}`, headers: { cookie: adminCookies } });
  assert.equal(getWorkflow.statusCode, 200);

  // --- List workflows ---
  const listWorkflows = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/workflows`, headers: { cookie: adminCookies } });
  assert.equal(listWorkflows.statusCode, 200);
  assert.ok(listWorkflows.json().workflows.length >= 1);

  // --- Cannot start a DRAFT workflow ---
  const startDraft = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${workflow.id}/start`, headers: { cookie: adminCookies }, payload: { input: {} } });
  assert.equal(startDraft.statusCode, 400);

  // --- Publish the workflow ---
  const publish = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${workflow.id}/publish`, headers: { cookie: adminCookies } });
  assert.equal(publish.statusCode, 200, publish.body);
  assert.equal(publish.json().status, "PUBLISHED");

  // --- Cannot edit a PUBLISHED workflow ---
  const editPublished = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/workflows/${workflow.id}`, headers: { cookie: adminCookies }, payload: { name: "Changed" } });
  assert.equal(editPublished.statusCode, 409);

  // --- Start the workflow ---
  const start = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${workflow.id}/start`, headers: { cookie: adminCookies }, payload: { input: { empresa: "ACME Lda" } } });
  assert.equal(start.statusCode, 201, start.body);
  const instance = start.json();
  assert.equal(instance.status, "WAITING_APPROVAL", `Expected WAITING_APPROVAL, got ${instance.status}`);
  assert.equal(instance.currentStepOrder, 2);

  // --- A task was created ---
  const context = instance.context ?? {};
  assert.ok(context.taskId, "Context should contain taskId from CREATE_TASK step");

  // --- Step executions recorded ---
  assert.ok(instance.executions.length >= 3, `Expected at least 3 executions, got ${instance.executions.length}`);
  assert.equal(instance.executions[0]!.stepType, "START");
  assert.equal(instance.executions[1]!.stepType, "CREATE_TASK");
  assert.equal(instance.executions[2]!.stepType, "APPROVAL");

  // --- An approval was created ---
  assert.equal(instance.approvals.length, 1);
  assert.equal(instance.approvals[0]!.status, "PENDING");
  assert.equal(instance.approvals[0]!.approver.name, "WF Approver");

  // --- A notification was sent to the approver ---
  const notifications = await prisma.notification.findMany({ where: { tenantId: organizationId, recipientId: approverMembershipId, type: "workflow.approval" } });
  assert.ok(notifications.length >= 1);

  // --- Viewer cannot manage ---
  const viewerLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: viewerEmail, password: "WfPassword123" } });
  assert.equal(viewerLogin.statusCode, 200);
  const viewerCookies = cookies(viewerLogin);
  const viewerStart = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${workflow.id}/start`, headers: { cookie: viewerCookies }, payload: { input: {} } });
  assert.equal(viewerStart.statusCode, 403);

  // --- Approver decides APPROVED ---
  const approverLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: approverEmail, password: "WfPassword123" } });
  assert.equal(approverLogin.statusCode, 200);
  const approverCookies = cookies(approverLogin);
  const approvalId = instance.approvals[0]!.id;
  const approve = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/approvals/${approvalId}/decide`, headers: { cookie: approverCookies }, payload: { decision: "APPROVED", note: "Tudo OK" } });
  assert.equal(approve.statusCode, 200, approve.body);
  const approvedInstance = approve.json();
  assert.equal(approvedInstance.status, "COMPLETED", `Expected COMPLETED, got ${approvedInstance.status}`);

  // --- The task status was changed to DONE ---
  const taskId = context.taskId as string;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  assert.equal(task?.status, "DONE");

  // --- All step executions completed ---
  const completedExecs = approvedInstance.executions.filter((e: { status: string }) => e.status === "COMPLETED");
  assert.ok(completedExecs.length >= 5, `Expected at least 5 completed executions, got ${completedExecs.length}`);

  // --- List instances ---
  const listInstances = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/workflow-instances`, headers: { cookie: adminCookies } });
  assert.equal(listInstances.statusCode, 200);
  assert.ok(listInstances.json().instances.length >= 1);

  // --- Filter instances by status ---
  const completedInstances = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/workflow-instances?status=COMPLETED`, headers: { cookie: adminCookies } });
  assert.equal(completedInstances.statusCode, 200);
  assert.ok(completedInstances.json().instances.every((i: { status: string }) => i.status === "COMPLETED"));

  // --- Start another instance and reject it ---
  const start2 = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${workflow.id}/start`, headers: { cookie: adminCookies }, payload: { input: { empresa: "XYZ" } } });
  assert.equal(start2.statusCode, 201);
  const instance2 = start2.json();
  const approval2Id = instance2.approvals[0]!.id;
  const reject = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/approvals/${approval2Id}/decide`, headers: { cookie: approverCookies }, payload: { decision: "REJECTED" } });
  assert.equal(reject.statusCode, 200);
  assert.equal(reject.json().status, "FAILED", `Expected FAILED on rejection without jump, got ${reject.json().status}`);

  // --- Archive the workflow ---
  const archive = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${workflow.id}/archive`, headers: { cookie: adminCookies } });
  assert.equal(archive.statusCode, 200);
  assert.equal(archive.json().status, "ARCHIVED");

  // --- Cannot start an ARCHIVED workflow ---
  const startArchived = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${workflow.id}/start`, headers: { cookie: adminCookies }, payload: { input: {} } });
  assert.equal(startArchived.statusCode, 400);

  // --- Cannot delete a workflow with instances ---
  const deleteWithInstances = await app.inject({ method: "DELETE", url: `/api/v1/organizations/${organizationId}/workflows/${workflow.id}`, headers: { cookie: adminCookies } });
  assert.equal(deleteWithInstances.statusCode, 409);

  // --- Audit log was created ---
  const audit = await prisma.auditLog.findFirst({ where: { tenantId: organizationId, resourceId: workflow.id, action: "workflow.created" } });
  assert.ok(audit);
});

test("publish requires valid structure and executable step config", async () => {
  const registration = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload: { name: "WF Publish", email: publishEmail, password: "WfPassword123", organizationName: "WF Publish Org" } });
  assert.equal(registration.statusCode, 201);
  const organizationId = registration.json().organizations[0].id as string;
  organizationIds.push(organizationId);
  const adminCookies = cookies(registration);

  const created = await app.inject({
    method: "POST",
    url: `/api/v1/organizations/${organizationId}/workflows`,
    headers: { cookie: adminCookies },
    payload: {
      name: "Incomplete draft",
      steps: [
        { order: 0, type: "START", name: "Start", config: {} },
        { order: 1, type: "CREATE_TASK", name: "Task", config: { priority: "HIGH" } },
        { order: 2, type: "END", name: "End", config: {} }
      ]
    }
  });
  assert.equal(created.statusCode, 201, created.body);
  const draftId = created.json().id as string;

  // Publishing a draft whose CREATE_TASK has no title fails and leaves it a draft.
  const publish = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${draftId}/publish`, headers: { cookie: adminCookies } });
  assert.equal(publish.statusCode, 400);
  assert.equal(publish.json().error.code, "VALIDATION_ERROR");
  const stillDraft = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/workflows/${draftId}`, headers: { cookie: adminCookies } });
  assert.equal(stillDraft.json().status, "DRAFT");

  // Malformed step updates are rejected.
  const duplicateStart = await app.inject({
    method: "PATCH",
    url: `/api/v1/organizations/${organizationId}/workflows/${draftId}`,
    headers: { cookie: adminCookies },
    payload: { steps: [
      { order: 0, type: "START", name: "Start", config: {} },
      { order: 1, type: "START", name: "Start again", config: {} },
      { order: 2, type: "END", name: "End", config: {} }
    ] }
  });
  assert.equal(duplicateStart.statusCode, 400);

  const misplacedEnd = await app.inject({
    method: "PATCH",
    url: `/api/v1/organizations/${organizationId}/workflows/${draftId}`,
    headers: { cookie: adminCookies },
    payload: { steps: [
      { order: 0, type: "START", name: "Start", config: {} },
      { order: 1, type: "END", name: "End", config: {} },
      { order: 2, type: "CREATE_TASK", name: "Task", config: { title: "x" } }
    ] }
  });
  assert.equal(misplacedEnd.statusCode, 400);

  // Partial name-only updates remain valid.
  const rename = await app.inject({ method: "PATCH", url: `/api/v1/organizations/${organizationId}/workflows/${draftId}`, headers: { cookie: adminCookies }, payload: { name: "Incomplete draft v2" } });
  assert.equal(rename.statusCode, 200, rename.body);

  // Fixing the config lets the draft publish.
  const fix = await app.inject({
    method: "PATCH",
    url: `/api/v1/organizations/${organizationId}/workflows/${draftId}`,
    headers: { cookie: adminCookies },
    payload: { steps: [
      { order: 0, type: "START", name: "Start", config: {} },
      { order: 1, type: "CREATE_TASK", name: "Task", config: { title: "Review request" } },
      { order: 2, type: "END", name: "End", config: {} }
    ] }
  });
  assert.equal(fix.statusCode, 200, fix.body);
  const publishNow = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${draftId}/publish`, headers: { cookie: adminCookies } });
  assert.equal(publishNow.statusCode, 200, publishNow.body);

  // A draft persisted with duplicate/sparse step orders cannot be published.
  const sparseDraft = await prisma.workflowDefinition.create({
    data: {
      tenantId: organizationId,
      name: "Sparse order draft",
      steps: {
        create: [
          { tenantId: organizationId, order: 0, type: "START", name: "Start", configJson: "{}" },
          { tenantId: organizationId, order: 0, type: "CREATE_TASK", name: "Task", configJson: JSON.stringify({ title: "x" }) },
          { tenantId: organizationId, order: 5, type: "END", name: "End", configJson: "{}" }
        ]
      }
    }
  });
  const sparsePublish = await app.inject({ method: "POST", url: `/api/v1/organizations/${organizationId}/workflows/${sparseDraft.id}/publish`, headers: { cookie: adminCookies } });
  assert.equal(sparsePublish.statusCode, 400);
  assert.equal(sparsePublish.json().error.code, "VALIDATION_ERROR");
  const sparseStillDraft = await app.inject({ method: "GET", url: `/api/v1/organizations/${organizationId}/workflows/${sparseDraft.id}`, headers: { cookie: adminCookies } });
  assert.equal(sparseStillDraft.json().status, "DRAFT");
});
