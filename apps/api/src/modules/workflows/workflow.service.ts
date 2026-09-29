import type {
  ApprovalDto,
  ApprovalStatus,
  WorkflowDefinitionDto,
  WorkflowInstanceDto,
  WorkflowInstanceStatus,
  WorkflowInstancesResponse,
  WorkflowStepDto,
  WorkflowStepExecutionDto,
  WorkflowStepType,
  WorkflowsResponse
} from "@nexora/contracts";
import type { WorkflowDefinition, WorkflowInstance, WorkflowStep, WorkflowStepExecution, Approval } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { notify } from "../notifications/notification.service.js";
import { publishResourceEvent } from "../collaboration/realtime.service.js";

export interface ActorContext {
  organizationId: string;
  userId: string;
  membershipId: string;
  isSuperAdmin: boolean;
  capabilities?: Set<string>;
}

export async function getActor(organizationId: string, userId: string, isSuperAdmin: boolean): Promise<ActorContext> {
  const membership = await prisma.organizationMember.findFirst({
    where: { tenantId: organizationId, userId, status: "ACTIVE", tenant: { status: "ACTIVE" } },
    include: { membershipRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
  });
  if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");
  return {
    organizationId,
    userId,
    membershipId: membership.id,
    isSuperAdmin,
    capabilities: new Set(membership.membershipRoles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))
  };
}

// --- DTO mappers ---

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function toStepDto(step: WorkflowStep): WorkflowStepDto {
  return {
    id: step.id,
    order: step.order,
    type: step.type as WorkflowStepType,
    name: step.name,
    config: parseJson<Record<string, unknown>>(step.configJson, {})
  };
}

function toWorkflowDto(workflow: WorkflowDefinition & { steps: WorkflowStep[]; _count?: { instances: number } }): WorkflowDefinitionDto {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    version: workflow.version,
    status: workflow.status as WorkflowDefinitionDto["status"],
    steps: workflow.steps.map(toStepDto).sort((a, b) => a.order - b.order),
    instanceCount: workflow._count?.instances ?? 0,
    createdAt: workflow.createdAt.toISOString(),
    updatedAt: workflow.updatedAt.toISOString()
  };
}

function toExecutionDto(exec: WorkflowStepExecution): WorkflowStepExecutionDto {
  return {
    id: exec.id,
    stepOrder: exec.stepOrder,
    stepType: exec.stepType as WorkflowStepType,
    stepName: exec.stepName,
    status: exec.status as WorkflowStepExecutionDto["status"],
    result: parseJson<Record<string, unknown> | null>(exec.resultJson, null),
    errorMessage: exec.errorMessage,
    startedAt: exec.startedAt.toISOString(),
    completedAt: exec.completedAt?.toISOString() ?? null
  };
}

function toApprovalDto(approval: Approval & { approver: { id: string; userId: string; user: { id: string; name: string } } }): ApprovalDto {
  return {
    id: approval.id,
    stepOrder: approval.stepOrder,
    approver: { id: approval.approver.user.id, name: approval.approver.user.name },
    status: approval.status as ApprovalStatus,
    decisionNote: approval.decisionNote,
    decidedAt: approval.decidedAt?.toISOString() ?? null,
    createdAt: approval.createdAt.toISOString()
  };
}

function toInstanceDto(instance: WorkflowInstance & {
  workflowDefinition: WorkflowDefinition & { steps: WorkflowStep[] };
  startedBy: { id: string; userId: string; user: { id: string; name: string } };
  stepExecutions: WorkflowStepExecution[];
  approvals: (Approval & { approver: { id: string; userId: string; user: { id: string; name: string } } })[];
}): WorkflowInstanceDto {
  return {
    id: instance.id,
    workflowDefinitionId: instance.workflowDefinitionId,
    workflowName: instance.workflowDefinition.name,
    status: instance.status as WorkflowInstanceStatus,
    currentStepOrder: instance.currentStepOrder,
    startedBy: { id: instance.startedBy.user.id, name: instance.startedBy.user.name },
    input: parseJson<Record<string, unknown> | null>(instance.inputJson, null),
    context: parseJson<Record<string, unknown> | null>(instance.contextJson, null),
    output: parseJson<Record<string, unknown> | null>(instance.outputJson, null),
    errorMessage: instance.errorMessage,
    startedAt: instance.startedAt.toISOString(),
    completedAt: instance.completedAt?.toISOString() ?? null,
    steps: instance.workflowDefinition.steps.map(toStepDto).sort((a, b) => a.order - b.order),
    executions: instance.stepExecutions.map(toExecutionDto).sort((a, b) => a.stepOrder - b.stepOrder),
    approvals: instance.approvals.map(toApprovalDto)
  };
}

// --- CRUD ---

export interface ListWorkflowsInput { search?: string; status?: string }

export async function listWorkflows(actor: ActorContext, input: ListWorkflowsInput): Promise<WorkflowsResponse> {
  const workflows = await prisma.workflowDefinition.findMany({
    where: {
      tenantId: actor.organizationId,
      name: input.search ? { contains: input.search, mode: "insensitive" as const } : undefined,
      status: input.status
    },
    include: { steps: { orderBy: { order: "asc" } }, _count: { select: { instances: true } } },
    orderBy: { updatedAt: "desc" }
  });
  return { workflows: workflows.map(toWorkflowDto), total: workflows.length };
}

export async function getWorkflow(actor: ActorContext, workflowId: string): Promise<WorkflowDefinitionDto> {
  const workflow = await prisma.workflowDefinition.findFirst({
    where: { id: workflowId, tenantId: actor.organizationId },
    include: { steps: { orderBy: { order: "asc" } }, _count: { select: { instances: true } } }
  });
  if (!workflow) throw new AppError(404, "WORKFLOW_NOT_FOUND", "The workflow was not found.");
  return toWorkflowDto(workflow);
}

export interface CreateWorkflowInput { name: string; description?: string; steps: { id?: string; order: number; type: WorkflowStepType; name: string; config: Record<string, unknown> }[] }

export async function createWorkflow(actor: ActorContext, input: CreateWorkflowInput): Promise<WorkflowDefinitionDto> {
  const existing = await prisma.workflowDefinition.findFirst({ where: { tenantId: actor.organizationId, name: input.name } });
  if (existing) throw new AppError(409, "RESOURCE_ALREADY_EXISTS", "A workflow with this name already exists.");

  // Check plan limits before creating workflow
  const { checkLimit } = await import("../billing/plan.service.js");
  await checkLimit(actor.organizationId, "workflows");

  const workflow = await prisma.workflowDefinition.create({
    data: {
      tenantId: actor.organizationId,
      name: input.name,
      description: input.description,
      definitionJson: JSON.stringify({ steps: input.steps }),
      status: "DRAFT",
      createdById: actor.userId,
      steps: { create: input.steps.map((s) => ({ tenantId: actor.organizationId, order: s.order, type: s.type, name: s.name, configJson: JSON.stringify(s.config) })) }
    },
    include: { steps: { orderBy: { order: "asc" } }, _count: { select: { instances: true } } }
  });
  await audit(actor, "workflow.created", workflow.id, { name: workflow.name });
  return toWorkflowDto(workflow);
}

export async function updateWorkflow(actor: ActorContext, workflowId: string, input: { name?: string; description?: string | null; steps?: { id?: string; order: number; type: WorkflowStepType; name: string; config: Record<string, unknown> }[] }): Promise<WorkflowDefinitionDto> {
  const existing = await prisma.workflowDefinition.findFirst({ where: { id: workflowId, tenantId: actor.organizationId }, include: { steps: true } });
  if (!existing) throw new AppError(404, "WORKFLOW_NOT_FOUND", "The workflow was not found.");
  if (existing.status === "PUBLISHED") throw new AppError(409, "WORKFLOW_LOCKED", "Published workflows cannot be edited. Create a new version or archive first.");

  if (input.name && input.name !== existing.name) {
    const clash = await prisma.workflowDefinition.findFirst({ where: { tenantId: actor.organizationId, name: input.name, NOT: { id: workflowId } } });
    if (clash) throw new AppError(409, "RESOURCE_ALREADY_EXISTS", "A workflow with this name already exists.");
  }

  if (input.steps) {
    await prisma.workflowStep.deleteMany({ where: { workflowDefinitionId: workflowId } });
    await prisma.workflowStep.createMany({
      data: input.steps.map((s) => ({
        tenantId: actor.organizationId,
        workflowDefinitionId: workflowId,
        order: s.order,
        type: s.type,
        name: s.name,
        configJson: JSON.stringify(s.config)
      }))
    });
  }

  const updated = await prisma.workflowDefinition.update({
    where: { id: workflowId },
    data: {
      name: input.name,
      description: input.description === null ? null : input.description,
      definitionJson: input.steps ? JSON.stringify({ steps: input.steps }) : undefined
    },
    include: { steps: { orderBy: { order: "asc" } }, _count: { select: { instances: true } } }
  });
  await audit(actor, "workflow.updated", workflowId, { name: updated.name });
  return toWorkflowDto(updated);
}

export async function deleteWorkflow(actor: ActorContext, workflowId: string): Promise<void> {
  const workflow = await prisma.workflowDefinition.findFirst({ where: { id: workflowId, tenantId: actor.organizationId } });
  if (!workflow) throw new AppError(404, "WORKFLOW_NOT_FOUND", "The workflow was not found.");
  const instanceCount = await prisma.workflowInstance.count({ where: { workflowDefinitionId: workflowId } });
  if (instanceCount > 0) throw new AppError(409, "WORKFLOW_HAS_INSTANCES", "Cannot delete a workflow that has been executed. Archive it instead.");
  await prisma.workflowDefinition.delete({ where: { id: workflowId } });
  await audit(actor, "workflow.deleted", workflowId, { name: workflow.name });
}

const REQUIRED_CONFIG: Partial<Record<WorkflowStepType, readonly string[]>> = {
  CREATE_TASK: ["title"],
  SEND_NOTIFICATION: ["recipientId", "title", "body"],
  SEND_EMAIL: ["to", "subject", "body"],
  APPROVAL: ["approverId"],
  CHANGE_STATUS: ["status"],
  ASSIGN_USER: ["assignedMembershipId"],
  CHANGE_FIELD: ["field"],
  MOVE_DOCUMENT: ["documentId", "folderId"],
  CONDITION: ["variable", "jumpToOrder"]
};

function isConfigValueSupplied(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function assertPublishable(steps: WorkflowStep[]) {
  if (steps.length === 0) throw new AppError(400, "VALIDATION_ERROR", "Cannot publish a workflow without steps.");
  if (steps[0]!.type !== "START") throw new AppError(400, "VALIDATION_ERROR", "The first step must be START.");
  if (steps[steps.length - 1]!.type !== "END") throw new AppError(400, "VALIDATION_ERROR", "The last step must be END.");
  if (steps.filter((step) => step.type === "START").length > 1) throw new AppError(400, "VALIDATION_ERROR", "There can be at most one START step.");
  if (steps.filter((step) => step.type === "END").length > 1) throw new AppError(400, "VALIDATION_ERROR", "There can be at most one END step.");
  steps.forEach((step, index) => {
    if (step.order !== index) throw new AppError(400, "VALIDATION_ERROR", "Workflow steps must be contiguously ordered starting at 0.");
    const config = parseJson<Record<string, unknown>>(step.configJson, {});
    const missing = (REQUIRED_CONFIG[step.type as WorkflowStepType] ?? []).filter((field) => !isConfigValueSupplied(config[field]));
    if (missing.length > 0) throw new AppError(400, "VALIDATION_ERROR", `Step ${index + 1} (${step.name}) is missing required configuration: ${missing.join(", ")}.`);
    const jumpKeys = step.type === "CONDITION" ? (["jumpToOrder"] as const) : step.type === "APPROVAL" ? (["onRejectJumpToOrder"] as const) : [];
    for (const key of jumpKeys) {
      const value = config[key];
      if (value === undefined || value === null) continue;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > steps.length - 1) {
        throw new AppError(400, "VALIDATION_ERROR", `Step ${index + 1} (${step.name}) has an invalid jump target: ${key} must be an integer between 0 and ${steps.length - 1}.`);
      }
    }
  });
}

export async function changeWorkflowStatus(actor: ActorContext, workflowId: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED"): Promise<WorkflowDefinitionDto> {
  const workflow = await prisma.workflowDefinition.findFirst({ where: { id: workflowId, tenantId: actor.organizationId }, include: { steps: { orderBy: { order: "asc" } } } });
  if (!workflow) throw new AppError(404, "WORKFLOW_NOT_FOUND", "The workflow was not found.");

  if (status === "PUBLISHED") {
    assertPublishable(workflow.steps);
  }

  const updated = await prisma.workflowDefinition.update({
    where: { id: workflowId },
    data: { status },
    include: { steps: { orderBy: { order: "asc" } }, _count: { select: { instances: true } } }
  });
  await audit(actor, status === "PUBLISHED" ? "workflow.published" : status === "ARCHIVED" ? "workflow.archived" : "workflow.unpublished", workflowId, { name: workflow.name });
  return toWorkflowDto(updated);
}

// --- Instances ---

export async function listInstances(actor: ActorContext, input: { status?: string; workflowDefinitionId?: string }): Promise<WorkflowInstancesResponse> {
  const instances = await prisma.workflowInstance.findMany({
    where: {
      tenantId: actor.organizationId,
      status: input.status,
      workflowDefinitionId: input.workflowDefinitionId
    },
    include: {
      workflowDefinition: { include: { steps: { orderBy: { order: "asc" } } } },
      startedBy: { include: { user: { select: { id: true, name: true } } } },
      stepExecutions: { orderBy: { stepOrder: "asc" } },
      approvals: { include: { approver: { include: { user: { select: { id: true, name: true } } } } } }
    },
    orderBy: { startedAt: "desc" }
  });
  return { instances: instances.map(toInstanceDto), total: instances.length };
}

export async function getInstance(actor: ActorContext, instanceId: string): Promise<WorkflowInstanceDto> {
  const instance = await prisma.workflowInstance.findFirst({
    where: { id: instanceId, tenantId: actor.organizationId },
    include: {
      workflowDefinition: { include: { steps: { orderBy: { order: "asc" } } } },
      startedBy: { include: { user: { select: { id: true, name: true } } } },
      stepExecutions: { orderBy: { stepOrder: "asc" } },
      approvals: { include: { approver: { include: { user: { select: { id: true, name: true } } } } } }
    }
  });
  if (!instance) throw new AppError(404, "INSTANCE_NOT_FOUND", "The workflow instance was not found.");
  return toInstanceDto(instance);
}

export async function startInstance(actor: ActorContext, workflowId: string, input: Record<string, unknown>): Promise<WorkflowInstanceDto> {
  const workflow = await prisma.workflowDefinition.findFirst({
    where: { id: workflowId, tenantId: actor.organizationId },
    include: { steps: { orderBy: { order: "asc" } } }
  });
  if (!workflow) throw new AppError(404, "WORKFLOW_NOT_FOUND", "The workflow was not found.");
  if (workflow.status !== "PUBLISHED") throw new AppError(400, "WORKFLOW_NOT_PUBLISHED", "Only published workflows can be started.");
  if (workflow.steps.length === 0) throw new AppError(400, "VALIDATION_ERROR", "The workflow has no steps.");

  const context: Record<string, unknown> = { ...input };
  const instance = await prisma.workflowInstance.create({
    data: {
      tenantId: actor.organizationId,
      workflowDefinitionId: workflowId,
      startedById: actor.membershipId,
      status: "RUNNING",
      currentStepOrder: 0,
      inputJson: JSON.stringify(input),
      contextJson: JSON.stringify(context)
    },
    include: {
      workflowDefinition: { include: { steps: { orderBy: { order: "asc" } } } },
      startedBy: { include: { user: { select: { id: true, name: true } } } },
      stepExecutions: { orderBy: { stepOrder: "asc" } },
      approvals: { include: { approver: { include: { user: { select: { id: true, name: true } } } } } }
    }
  });
  await audit(actor, "workflow.started", instance.id, { workflowName: workflow.name });
  await runInstance(instance.id);
  return getInstance(actor, instance.id);
}

export async function cancelInstance(actor: ActorContext, instanceId: string): Promise<WorkflowInstanceDto> {
  const instance = await prisma.workflowInstance.findFirst({ where: { id: instanceId, tenantId: actor.organizationId } });
  if (!instance) throw new AppError(404, "INSTANCE_NOT_FOUND", "The workflow instance was not found.");
  if (instance.status === "COMPLETED" || instance.status === "CANCELLED") throw new AppError(409, "INSTANCE_NOT_CANCELLABLE", "This instance is already finished.");
  const updated = await prisma.workflowInstance.update({
    where: { id: instanceId },
    data: { status: "CANCELLED", completedAt: new Date() },
    include: {
      workflowDefinition: { include: { steps: { orderBy: { order: "asc" } } } },
      startedBy: { include: { user: { select: { id: true, name: true } } } },
      stepExecutions: { orderBy: { stepOrder: "asc" } },
      approvals: { include: { approver: { include: { user: { select: { id: true, name: true } } } } } }
    }
  });
  await audit(actor, "workflow.cancelled", instanceId, {});
  return toInstanceDto(updated);
}

export async function decideApproval(actor: ActorContext, approvalId: string, decision: "APPROVED" | "REJECTED", note?: string): Promise<WorkflowInstanceDto> {
  const approval = await prisma.approval.findFirst({
    where: { id: approvalId, tenantId: actor.organizationId },
    include: { workflowInstance: { include: { workflowDefinition: { include: { steps: { orderBy: { order: "asc" } } } }, startedBy: { include: { user: { select: { id: true, name: true } } } } } } }
  });
  if (!approval) throw new AppError(404, "APPROVAL_NOT_FOUND", "The approval was not found.");
  if (approval.status !== "PENDING") throw new AppError(409, "APPROVAL_ALREADY_DECIDED", "This approval has already been decided.");
  if (approval.approverId !== actor.membershipId && !actor.isSuperAdmin) throw new AppError(403, "FORBIDDEN", "Only the designated approver can decide this approval.");

  const instance = approval.workflowInstance;
  if (instance.status !== "WAITING_APPROVAL") throw new AppError(409, "INSTANCE_NOT_WAITING", "This instance is not waiting for approval.");

  await prisma.approval.update({
    where: { id: approvalId },
    data: { status: decision, decisionNote: note, decidedAt: new Date() }
  });

  // Mark the pending-approval notification as read for the approver
  await prisma.notification.updateMany({
    where: {
      tenantId: actor.organizationId,
      recipientId: approval.approverId,
      type: "workflow.approval",
      readAt: null,
      AND: [
        { dataJson: { contains: `"workflowInstanceId":"${instance.id}"` } },
        { dataJson: { contains: `"stepOrder":${approval.stepOrder}` } }
      ]
    },
    data: { readAt: new Date() }
  });

  // Notify the workflow starter that the approval was decided
  if (instance.startedById !== actor.membershipId) {
    await notify({
      tenantId: actor.organizationId,
      recipientId: instance.startedById,
      type: "workflow.approval.decided",
      title: decision === "APPROVED" ? "Aprovação concedida" : "Aprovação rejeitada",
      body: `A aprovação no processo "${instance.workflowDefinition.name}" foi ${decision === "APPROVED" ? "aprovada" : "rejeitada"} por ${actor.membershipId === instance.startedById ? "si" : "um aprovador"}.`,
      data: { workflowInstanceId: instance.id, approvalId, decision }
    });
  }

  const step = instance.workflowDefinition.steps.find((s) => s.order === approval.stepOrder);
  const config = parseJson<Record<string, unknown>>(step?.configJson ?? null, {});

  if (decision === "APPROVED") {
    const context = parseJson<Record<string, unknown>>(instance.contextJson, {});
    context.__lastApproval = "APPROVED";
    await prisma.workflowInstance.update({
      where: { id: instance.id },
      data: { status: "RUNNING", currentStepOrder: instance.currentStepOrder + 1, contextJson: JSON.stringify(context) }
    });
    await audit(actor, "workflow.approved", instance.id, { stepOrder: approval.stepOrder });
    await runInstance(instance.id);
  } else {
    const onRejectJump = typeof config.onRejectJumpToOrder === "number" ? config.onRejectJumpToOrder : null;
    if (onRejectJump !== null) {
      const context = parseJson<Record<string, unknown>>(instance.contextJson, {});
      context.__lastApproval = "REJECTED";
      await prisma.workflowInstance.update({
        where: { id: instance.id },
        data: { status: "RUNNING", currentStepOrder: onRejectJump, contextJson: JSON.stringify(context) }
      });
      await audit(actor, "workflow.rejected", instance.id, { stepOrder: approval.stepOrder, jumpTo: onRejectJump });
      await runInstance(instance.id);
    } else {
      await prisma.workflowInstance.update({
        where: { id: instance.id },
        data: { status: "FAILED", errorMessage: `Workflow rejected at step ${approval.stepOrder}`, completedAt: new Date() }
      });
      await audit(actor, "workflow.rejected", instance.id, { stepOrder: approval.stepOrder });
    }
  }

  publishResourceEvent(actor.organizationId, "approval", approvalId, "resource.updated");
  return getInstance(actor, instance.id);
}

// --- The Execution Engine ---

async function notifyWorkflowCompleted(instance: WorkflowInstance & { workflowDefinition: { name: string }; startedBy: { id: string; userId: string } }) {
  await notify({
    tenantId: instance.tenantId,
    recipientId: instance.startedById,
    type: "workflow.completed",
    title: "Processo concluído",
    body: `O processo "${instance.workflowDefinition.name}" foi concluído com sucesso.`,
    data: { workflowInstanceId: instance.id }
  });
}

async function runInstance(instanceId: string): Promise<void> {
  for (let iterations = 0; iterations < 100; iterations++) {
    const instance = await prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: { workflowDefinition: { include: { steps: { orderBy: { order: "asc" } } } }, startedBy: true }
    });
    if (!instance) return;
    if (instance.status !== "RUNNING") return;

    const steps = instance.workflowDefinition.steps;
    const step = steps.find((s) => s.order === instance.currentStepOrder);
    if (!step) {
      await prisma.workflowInstance.update({ where: { id: instanceId }, data: { status: "COMPLETED", completedAt: new Date() } });
      await notifyWorkflowCompleted(instance);
      return;
    }

    const context = parseJson<Record<string, unknown>>(instance.contextJson, {});
    const execution = await prisma.workflowStepExecution.create({
      data: {
        tenantId: instance.tenantId,
        workflowInstanceId: instanceId,
        stepOrder: step.order,
        stepType: step.type,
        stepName: step.name,
        status: "RUNNING"
      }
    });

    try {
      const config = resolveConfig(parseJson<Record<string, unknown>>(step.configJson, {}), context);
      const result = await executeStep(step, config, context, instance);

      await prisma.workflowStepExecution.update({
        where: { id: execution.id },
        data: { status: "COMPLETED", resultJson: JSON.stringify(result ?? {}), completedAt: new Date() }
      });

      if (step.type === "APPROVAL") {
        await prisma.workflowInstance.update({
          where: { id: instanceId },
          data: { status: "WAITING_APPROVAL", contextJson: JSON.stringify(context) }
        });
        return;
      }

      if (step.type === "CONDITION") {
        const jumpTo = result?.jumpToOrder;
        const nextOrder = typeof jumpTo === "number" ? jumpTo : instance.currentStepOrder + 1;
        await prisma.workflowInstance.update({
          where: { id: instanceId },
          data: { currentStepOrder: nextOrder, contextJson: JSON.stringify(context) }
        });
        continue;
      }

      if (step.type === "END") {
        await prisma.workflowInstance.update({
          where: { id: instanceId },
          data: { status: "COMPLETED", completedAt: new Date(), contextJson: JSON.stringify(context), outputJson: JSON.stringify(result ?? {}) }
        });
        await notifyWorkflowCompleted(instance);
        return;
      }

      await prisma.workflowInstance.update({
        where: { id: instanceId },
        data: { currentStepOrder: instance.currentStepOrder + 1, contextJson: JSON.stringify(context) }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown execution error";
      await prisma.workflowStepExecution.update({
        where: { id: execution.id },
        data: { status: "FAILED", errorMessage: message, completedAt: new Date() }
      });
      await prisma.workflowInstance.update({
        where: { id: instanceId },
        data: { status: "FAILED", errorMessage: `Step ${step.order} (${step.type}): ${message}`, completedAt: new Date() }
      });
      return;
    }
  }
}

async function executeStep(step: WorkflowStep, config: Record<string, unknown>, context: Record<string, unknown>, instance: WorkflowInstance & { workflowDefinition: WorkflowDefinition & { steps: WorkflowStep[] }; startedBy: { id: string; userId: string } }): Promise<Record<string, unknown> | void> {
  switch (step.type as WorkflowStepType) {
    case "START":
      return {};

    case "CREATE_TASK": {
      const title = String(config.title ?? "").trim();
      if (!title) throw new Error("CREATE_TASK requires a 'title' in config.");
      const task = await prisma.task.create({
        data: {
          tenantId: instance.tenantId,
          title,
          description: config.description ? String(config.description) : null,
          status: (config.status as string) ?? "TODO",
          priority: (config.priority as string) ?? "NORMAL",
          dueAt: config.dueAt ? new Date(String(config.dueAt)) : null,
          assignedMembershipId: config.assignedMembershipId ? String(config.assignedMembershipId) : null,
          projectId: config.projectId ? String(config.projectId) : null,
          createdById: instance.startedBy.userId,
          tagsJson: "[]"
        }
      });
      const outputVar = (config.outputVariable as string) ?? "taskId";
      context[outputVar] = task.id;
      return { taskId: task.id };
    }

    case "SEND_NOTIFICATION": {
      const recipientId = String(config.recipientId ?? "").trim();
      const title = String(config.title ?? "").trim();
      const body = String(config.body ?? "").trim();
      if (!recipientId || !title || !body) throw new Error("SEND_NOTIFICATION requires recipientId, title and body.");
      const notification = await prisma.notification.create({
        data: {
          tenantId: instance.tenantId,
          recipientId,
          type: (config.type as string) ?? "workflow.notification",
          title,
          body,
          dataJson: JSON.stringify({ workflowInstanceId: instance.id })
        }
      });
      return { notificationId: notification.id };
    }

    case "SEND_EMAIL": {
      const to = String(config.to ?? "").trim();
      const subject = String(config.subject ?? "").trim();
      const body = String(config.body ?? "").trim();
      if (!to || !subject || !body) throw new Error("SEND_EMAIL requires to, subject and body.");
      // Email sending is logged — real SMTP delivery is handled by the notification/email service when configured.
      return { to, subject, body, sent: false, reason: "SMTP not configured in this environment" };
    }

    case "APPROVAL": {
      const approverId = String(config.approverId ?? "").trim();
      if (!approverId) throw new Error("APPROVAL requires an approverId.");
      const membership = await prisma.organizationMember.findFirst({ where: { id: approverId, tenantId: instance.tenantId, status: "ACTIVE" } });
      if (!membership) throw new Error("The configured approver is not an active member of this organization.");
      await prisma.approval.create({
        data: {
          tenantId: instance.tenantId,
          workflowInstanceId: instance.id,
          stepOrder: step.order,
          approverId,
          status: "PENDING"
        }
      });
      await prisma.notification.create({
        data: {
          tenantId: instance.tenantId,
          recipientId: approverId,
          type: "workflow.approval",
          title: (config.title as string) ?? "Aprovação necessária",
          body: `Tem uma aprovação pendente no processo "${instance.workflowDefinition.name}".`,
          dataJson: JSON.stringify({ workflowInstanceId: instance.id, stepOrder: step.order })
        }
      });
      return { approverId, pending: true };
    }

    case "CHANGE_STATUS": {
      const taskId = String(config.taskId ?? context.taskId ?? "").trim();
      if (!taskId) throw new Error("CHANGE_STATUS requires a taskId (in config or context).");
      const status = String(config.status ?? "").trim();
      if (!status) throw new Error("CHANGE_STATUS requires a status.");
      const task = await prisma.task.findFirst({ where: { id: taskId, tenantId: instance.tenantId } });
      if (!task) throw new Error("The referenced task was not found.");
      await prisma.task.update({ where: { id: taskId }, data: { status } });
      return { taskId, status };
    }

    case "ASSIGN_USER": {
      const taskId = String(config.taskId ?? context.taskId ?? "").trim();
      if (!taskId) throw new Error("ASSIGN_USER requires a taskId.");
      const assignedMembershipId = String(config.assignedMembershipId ?? "").trim();
      if (!assignedMembershipId) throw new Error("ASSIGN_USER requires an assignedMembershipId.");
      const task = await prisma.task.findFirst({ where: { id: taskId, tenantId: instance.tenantId } });
      if (!task) throw new Error("The referenced task was not found.");
      await prisma.task.update({ where: { id: taskId }, data: { assignedMembershipId } });
      await prisma.notification.create({
        data: {
          tenantId: instance.tenantId,
          recipientId: assignedMembershipId,
          type: "task.assigned",
          title: "Nova tarefa atribuída",
          body: `A tarefa "${task.title}" foi-lhe atribuída por um workflow.`,
          dataJson: JSON.stringify({ taskId, workflowInstanceId: instance.id })
        }
      });
      return { taskId, assignedMembershipId };
    }

    case "CHANGE_FIELD": {
      const taskId = String(config.taskId ?? context.taskId ?? "").trim();
      const field = String(config.field ?? "").trim();
      const value = config.value;
      if (!taskId || !field) throw new Error("CHANGE_FIELD requires taskId and field.");
      const task = await prisma.task.findFirst({ where: { id: taskId, tenantId: instance.tenantId } });
      if (!task) throw new Error("The referenced task was not found.");
      const allowedFields: Record<string, string> = { title: "title", description: "description", priority: "priority", dueAt: "dueAt" };
      const column = allowedFields[field];
      if (!column) throw new Error(`Cannot change field "${field}". Allowed: ${Object.keys(allowedFields).join(", ")}.`);
      const updateData: Record<string, unknown> = {};
      updateData[column] = column === "dueAt" ? (value ? new Date(String(value)) : null) : String(value);
      await prisma.task.update({ where: { id: taskId }, data: updateData as never });
      return { taskId, field, value };
    }

    case "MOVE_DOCUMENT": {
      const documentId = String(config.documentId ?? "").trim();
      const folderId = String(config.folderId ?? "").trim();
      if (!documentId || !folderId) throw new Error("MOVE_DOCUMENT requires documentId and folderId.");
      const doc = await prisma.document.findFirst({ where: { id: documentId, tenantId: instance.tenantId, status: "ACTIVE" } });
      if (!doc) throw new Error("The referenced document was not found.");
      const folder = await prisma.folder.findFirst({ where: { id: folderId, tenantId: instance.tenantId } });
      if (!folder) throw new Error("The target folder was not found.");
      await prisma.document.update({ where: { id: documentId }, data: { folderId } });
      return { documentId, folderId };
    }

    case "CONDITION": {
      const variable = String(config.variable ?? "").trim();
      const operator = String(config.operator ?? "equals");
      const compareValue = config.value;
      const jumpToOrder = config.jumpToOrder as number | undefined;
      const actualValue = variable ? context[variable] : undefined;
      let matches = false;
      if (operator === "equals") matches = String(actualValue) === String(compareValue);
      else if (operator === "not_equals") matches = String(actualValue) !== String(compareValue);
      else if (operator === "exists") matches = actualValue !== undefined;
      else if (operator === "not_exists") matches = actualValue === undefined;
      else if (operator === "gt" || operator === "gte" || operator === "lt" || operator === "lte") {
        const actual = Number(actualValue);
        const expected = Number(compareValue);
        if (Number.isFinite(actual) && Number.isFinite(expected)) {
          matches = operator === "gt" ? actual > expected : operator === "gte" ? actual >= expected : operator === "lt" ? actual < expected : actual <= expected;
        }
      }
      else throw new Error(`Unknown operator "${operator}".`);
      return matches && typeof jumpToOrder === "number" ? { jumpToOrder } : {};
    }

    case "END":
      return {};

    default:
      throw new Error(`Unknown step type "${step.type}".`);
  }
}

function resolveConfig(config: Record<string, unknown>, context: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    resolved[key] = resolveValue(value, context);
  }
  return resolved;
}

function resolveValue(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === "string") return resolveTemplate(value, context);
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, context));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = resolveValue(v, context);
    return out;
  }
  return value;
}

function resolveTemplate(value: string, context: Record<string, unknown>): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const v = context[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

// --- Helpers ---

async function audit(actor: ActorContext, action: string, resourceId: string, context?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      tenantId: actor.organizationId,
      actorId: actor.membershipId,
      action,
      resourceType: "workflow",
      resourceId,
      contextJson: context ? JSON.stringify(context) : null
    }
  });
}
