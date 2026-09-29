import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import {
  createQuickActionSchema,
  createTriggerSchema,
  createWorkflowSchema,
  decideApprovalSchema,
  listInstancesSchema,
  listQuickActionsSchema,
  listWorkflowsSchema,
  runQuickActionSchema,
  startWorkflowSchema,
  updateTriggerSchema,
  updateWorkflowSchema
} from "./workflow.schemas.js";
import {
  createQuickAction,
  createTrigger,
  deleteQuickAction,
  deleteTrigger,
  listAutomationResources,
  listQuickActions,
  listTriggers,
  runQuickAction,
  updateTrigger
} from "./automation.service.js";
import {
  cancelInstance,
  changeWorkflowStatus,
  createWorkflow,
  decideApproval,
  deleteWorkflow,
  getActor,
  getInstance,
  getWorkflow,
  listInstances,
  listWorkflows,
  startInstance,
  updateWorkflow
} from "./workflow.service.js";

const workflowsView = [authenticate, requirePermission(permissions.workflowsView)];
const workflowsManage = [authenticate, requirePermission(permissions.workflowsManage)];

function params(request: FastifyRequest) {
  return request.params as { organizationId: string; workflowId: string; instanceId: string; approvalId: string; triggerId: string; actionId: string };
}

async function actorFor(request: FastifyRequest) {
  const { organizationId } = params(request);
  return getActor(organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
}

export const workflowRoute: FastifyPluginAsync = async (app) => {
  // --- Workflow definitions ---
  app.get("/organizations/:organizationId/workflows", { preHandler: workflowsView }, async (request) => {
    return listWorkflows(await actorFor(request), listWorkflowsSchema.parse(request.query));
  });

  app.get("/organizations/:organizationId/workflows/:workflowId", { preHandler: workflowsView }, async (request) => {
    return getWorkflow(await actorFor(request), params(request).workflowId);
  });

  app.post("/organizations/:organizationId/workflows", { preHandler: workflowsManage }, async (request, reply) => {
    return reply.status(201).send(await createWorkflow(await actorFor(request), createWorkflowSchema.parse(request.body)));
  });

  app.patch("/organizations/:organizationId/workflows/:workflowId", { preHandler: workflowsManage }, async (request) => {
    return updateWorkflow(await actorFor(request), params(request).workflowId, updateWorkflowSchema.parse(request.body));
  });

  app.delete("/organizations/:organizationId/workflows/:workflowId", { preHandler: workflowsManage }, async (request, reply) => {
    await deleteWorkflow(await actorFor(request), params(request).workflowId);
    return reply.status(204).send();
  });

  app.post("/organizations/:organizationId/workflows/:workflowId/publish", { preHandler: workflowsManage }, async (request) => {
    return changeWorkflowStatus(await actorFor(request), params(request).workflowId, "PUBLISHED");
  });

  app.post("/organizations/:organizationId/workflows/:workflowId/archive", { preHandler: workflowsManage }, async (request) => {
    return changeWorkflowStatus(await actorFor(request), params(request).workflowId, "ARCHIVED");
  });

  app.post("/organizations/:organizationId/workflows/:workflowId/unpublish", { preHandler: workflowsManage }, async (request) => {
    return changeWorkflowStatus(await actorFor(request), params(request).workflowId, "DRAFT");
  });

  // --- Instances ---
  app.get("/organizations/:organizationId/workflow-instances", { preHandler: workflowsView }, async (request) => {
    return listInstances(await actorFor(request), listInstancesSchema.parse(request.query));
  });

  app.get("/organizations/:organizationId/workflow-instances/:instanceId", { preHandler: workflowsView }, async (request) => {
    return getInstance(await actorFor(request), params(request).instanceId);
  });

  app.post("/organizations/:organizationId/workflows/:workflowId/start", { preHandler: workflowsManage }, async (request, reply) => {
    return reply.status(201).send(await startInstance(await actorFor(request), params(request).workflowId, startWorkflowSchema.parse(request.body).input));
  });

  app.post("/organizations/:organizationId/workflow-instances/:instanceId/cancel", { preHandler: workflowsManage }, async (request) => {
    return cancelInstance(await actorFor(request), params(request).instanceId);
  });

  // --- Approvals ---
  app.post("/organizations/:organizationId/approvals/:approvalId/decide", { preHandler: [authenticate] }, async (request) => {
    const { decision, note } = decideApprovalSchema.parse(request.body);
    return decideApproval(await actorFor(request), params(request).approvalId, decision, note);
  });

  app.get("/organizations/:organizationId/automation-resources", { preHandler: workflowsManage }, async (request) => {
    return listAutomationResources(await actorFor(request));
  });

  // --- Workflow triggers (event-driven automation) ---
  app.get("/organizations/:organizationId/workflow-triggers", { preHandler: workflowsView }, async (request) => {
    return listTriggers(await actorFor(request));
  });

  app.post("/organizations/:organizationId/workflow-triggers", { preHandler: workflowsManage }, async (request, reply) => {
    return reply.status(201).send(await createTrigger(await actorFor(request), createTriggerSchema.parse(request.body)));
  });

  app.patch("/organizations/:organizationId/workflow-triggers/:triggerId", { preHandler: workflowsManage }, async (request) => {
    return updateTrigger(await actorFor(request), params(request).triggerId, updateTriggerSchema.parse(request.body));
  });

  app.delete("/organizations/:organizationId/workflow-triggers/:triggerId", { preHandler: workflowsManage }, async (request, reply) => {
    await deleteTrigger(await actorFor(request), params(request).triggerId);
    return reply.status(204).send();
  });

  // --- Quick actions (one-click automations on items) ---
  app.get("/organizations/:organizationId/quick-actions", { preHandler: workflowsView }, async (request) => {
    return listQuickActions(await actorFor(request), listQuickActionsSchema.parse(request.query));
  });

  app.post("/organizations/:organizationId/quick-actions", { preHandler: workflowsManage }, async (request, reply) => {
    return reply.status(201).send(await createQuickAction(await actorFor(request), createQuickActionSchema.parse(request.body)));
  });

  app.delete("/organizations/:organizationId/quick-actions/:actionId", { preHandler: workflowsManage }, async (request, reply) => {
    await deleteQuickAction(await actorFor(request), params(request).actionId);
    return reply.status(204).send();
  });

  app.post("/organizations/:organizationId/quick-actions/:actionId/run", { preHandler: workflowsView }, async (request, reply) => {
    return reply.status(201).send(await runQuickAction(await actorFor(request), params(request).actionId, runQuickActionSchema.parse(request.body)));
  });
};
