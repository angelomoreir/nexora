import type { AutomationResourcesResponse, QuickActionDto, QuickActionsResponse, WorkflowTriggerDto, WorkflowTriggersResponse } from "@nexora/contracts";
import type { QuickAction, WorkflowTrigger } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { notify } from "../notifications/notification.service.js";
import { permissions } from "../permissions/permissions.js";
import { startInstance, type ActorContext } from "./workflow.service.js";

// --- Workflow triggers (event-driven automation) ---

export const WORKFLOW_TRIGGER_EVENTS = [
  "document.created",
  "document.updated",
  "document.deleted",
  "document.version.added",
  "document.published",
  "list.item.created",
  "task.created",
  "form.submitted"
] as const;

export type WorkflowTriggerEvent = (typeof WORKFLOW_TRIGGER_EVENTS)[number];

const TRIGGER_EVENT_SCOPES: Record<WorkflowTriggerEvent, readonly string[]> = {
  "document.created": ["organization", "folder"],
  "document.updated": ["organization", "folder"],
  "document.deleted": ["organization", "folder"],
  "document.version.added": ["organization", "folder"],
  "document.published": ["organization", "folder"],
  "list.item.created": ["organization", "list"],
  "task.created": ["organization"],
  "form.submitted": ["organization"]
};

function toTriggerDto(trigger: WorkflowTrigger & { workflowDefinition?: { name: string; status: string } | null }): WorkflowTriggerDto {
  return {
    id: trigger.id,
    workflowDefinitionId: trigger.workflowDefinitionId,
    workflowName: trigger.workflowDefinition?.name ?? "",
    workflowStatus: trigger.workflowDefinition?.status ?? "",
    event: trigger.event,
    scopeType: trigger.scopeType as WorkflowTriggerDto["scopeType"],
    scopeId: trigger.scopeId,
    enabled: trigger.enabled,
    createdAt: trigger.createdAt.toISOString()
  };
}

export async function listTriggers(actor: ActorContext): Promise<WorkflowTriggersResponse> {
  const triggers = await prisma.workflowTrigger.findMany({
    where: { tenantId: actor.organizationId },
    include: { workflowDefinition: { select: { name: true, status: true } } },
    orderBy: { createdAt: "desc" }
  });
  return { triggers: triggers.map(toTriggerDto) };
}

export async function listAutomationResources(actor: ActorContext): Promise<AutomationResourcesResponse> {
  const folderRows = actor.isSuperAdmin || actor.capabilities?.has(permissions.documentsView) === true
    ? await prisma.folder.findMany({ where: { tenantId: actor.organizationId, status: "ACTIVE" }, select: { id: true, name: true, parentId: true } })
    : [];
  const folderById = new Map(folderRows.map((folder) => [folder.id, folder]));
  const folders = folderRows.map((folder) => {
    const parts = [folder.name];
    const seen = new Set([folder.id]);
    let current = folder;
    while (current.parentId && !seen.has(current.parentId) && folderById.has(current.parentId)) {
      seen.add(current.parentId);
      current = folderById.get(current.parentId)!;
      parts.unshift(current.name);
    }
    return { id: folder.id, name: folder.name, path: parts.join(" / ") };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const lists = actor.isSuperAdmin || actor.capabilities?.has(permissions.listsView) === true
    ? (await prisma.listDefinition.findMany({ where: { tenantId: actor.organizationId }, select: { id: true, name: true } })).sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const members = (await prisma.organizationMember.findMany({
    where: { tenantId: actor.organizationId, status: "ACTIVE" },
    select: { id: true, user: { select: { name: true } } }
  })).map((member) => ({ id: member.id, name: member.user.name })).sort((a, b) => a.name.localeCompare(b.name));
  return { folders, lists, members };
}

async function requireTriggerScopeResource(actor: ActorContext, scopeType: string, scopeId: string) {
  if (scopeType === "folder") {
    const folder = await prisma.folder.findFirst({ where: { id: scopeId, tenantId: actor.organizationId, status: "ACTIVE" } });
    if (!folder) throw new AppError(404, "FOLDER_NOT_FOUND", "The scope folder was not found.");
  } else if (scopeType === "list") {
    const list = await prisma.listDefinition.findFirst({ where: { id: scopeId, tenantId: actor.organizationId } });
    if (!list) throw new AppError(404, "LIST_NOT_FOUND", "The scope list was not found.");
  }
}

async function validateTriggerScope(actor: ActorContext, event: string, scopeType: string, scopeId: string | null) {
  const allowed = TRIGGER_EVENT_SCOPES[event as WorkflowTriggerEvent];
  if (!allowed?.includes(scopeType)) throw new AppError(400, "VALIDATION_ERROR", "This scope type is not supported for the selected event.");
  if (scopeType === "organization") return;
  if (!scopeId) throw new AppError(400, "VALIDATION_ERROR", "A scope resource is required for this scope type.");
  await requireTriggerScopeResource(actor, scopeType, scopeId);
}

export async function createTrigger(actor: ActorContext, input: { workflowDefinitionId: string; event: string; scopeType?: string; scopeId?: string | null; enabled?: boolean }): Promise<WorkflowTriggerDto> {
  const workflow = await prisma.workflowDefinition.findFirst({ where: { id: input.workflowDefinitionId, tenantId: actor.organizationId, status: "PUBLISHED" } });
  if (!workflow) throw new AppError(404, "WORKFLOW_NOT_FOUND", "The workflow was not found or is not published.");
  const scopeType = input.scopeType ?? "organization";
  const scopeId = scopeType === "organization" ? null : (input.scopeId ?? null);
  await validateTriggerScope(actor, input.event, scopeType, scopeId);
  const trigger = await prisma.workflowTrigger.create({
    data: {
      tenantId: actor.organizationId,
      workflowDefinitionId: input.workflowDefinitionId,
      event: input.event,
      scopeType,
      scopeId,
      enabled: input.enabled ?? true
    },
    include: { workflowDefinition: { select: { name: true, status: true } } }
  });
  return toTriggerDto(trigger);
}

export async function updateTrigger(actor: ActorContext, triggerId: string, input: { enabled?: boolean; event?: string; scopeType?: string; scopeId?: string | null }): Promise<WorkflowTriggerDto> {
  const trigger = await prisma.workflowTrigger.findFirst({ where: { id: triggerId, tenantId: actor.organizationId } });
  if (!trigger) throw new AppError(404, "TRIGGER_NOT_FOUND", "The trigger was not found.");
  const event = input.event ?? trigger.event;
  const scopeType = input.scopeType ?? trigger.scopeType;
  const scopeId = scopeType === "organization" ? null : (input.scopeId === undefined ? trigger.scopeId : input.scopeId);
  await validateTriggerScope(actor, event, scopeType, scopeId);
  const updated = await prisma.workflowTrigger.update({
    where: { id: trigger.id },
    data: { enabled: input.enabled, event, scopeType, scopeId },
    include: { workflowDefinition: { select: { name: true, status: true } } }
  });
  return toTriggerDto(updated);
}

export async function deleteTrigger(actor: ActorContext, triggerId: string) {
  const trigger = await prisma.workflowTrigger.findFirst({ where: { id: triggerId, tenantId: actor.organizationId } });
  if (!trigger) throw new AppError(404, "TRIGGER_NOT_FOUND", "The trigger was not found.");
  await prisma.workflowTrigger.delete({ where: { id: trigger.id } });
}

// Folder ancestor chain (inclusive), used to match folder-scoped triggers.
async function folderAncestors(tenantId: string, folderId: string | null): Promise<Set<string>> {
  const ids = new Set<string>();
  let currentId = folderId;
  let guard = 0;
  while (currentId && guard < 50) {
    guard += 1;
    ids.add(currentId);
    const folder = await prisma.folder.findFirst({ where: { id: currentId, tenantId }, select: { parentId: true } });
    currentId = folder?.parentId ?? null;
  }
  return ids;
}

/**
 * Fires all enabled triggers matching an event. Called from domain services
 * (documents, lists, tasks) at the same points where subscriptions/webhooks
 * are dispatched. Never throws — automation must not break the source action.
 */
export async function fireWorkflowEvent(
  actor: { organizationId: string; membershipId: string; userId: string; isSuperAdmin: boolean },
  event: WorkflowTriggerEvent,
  context: Record<string, unknown>
): Promise<void> {
  try {
    const triggers = await prisma.workflowTrigger.findMany({
      where: { tenantId: actor.organizationId, event, enabled: true }
    });
    if (triggers.length === 0) return;

    let folderChain: Set<string> | null = null;
    for (const trigger of triggers) {
      try {
        if (trigger.scopeType === "folder") {
          if (!context.folderId) continue;
          if (!folderChain) folderChain = await folderAncestors(actor.organizationId, context.folderId as string);
          if (!folderChain.has(trigger.scopeId ?? "")) continue;
        } else if (trigger.scopeType === "list") {
          if (context.listId !== trigger.scopeId) continue;
        }
        await startInstance(actor, trigger.workflowDefinitionId, {
          trigger: { id: trigger.id, event, scopeType: trigger.scopeType, scopeId: trigger.scopeId },
          ...context
        });
      } catch {
        // A single failing trigger (e.g. unpublished workflow) must not block others.
      }
    }
  } catch {
    // Automation dispatch failure must never break the source operation.
  }
}

// --- Quick actions (one-click workflow execution on an item) ---

function toQuickActionDto(action: QuickAction & { workflowDefinition?: { name: string; status: string } | null }): QuickActionDto {
  return {
    id: action.id,
    name: action.name,
    targetType: action.targetType as QuickActionDto["targetType"],
    workflowDefinitionId: action.workflowDefinitionId,
    workflowName: action.workflowDefinition?.name ?? "",
    workflowStatus: action.workflowDefinition?.status ?? "",
    scopeId: action.scopeId,
    position: action.position,
    createdAt: action.createdAt.toISOString()
  };
}

export async function listQuickActions(actor: ActorContext, input: { targetType?: string; folderId?: string }): Promise<QuickActionsResponse> {
  const actions = await prisma.quickAction.findMany({
    where: {
      tenantId: actor.organizationId,
      targetType: input.targetType,
      OR: [{ scopeId: null }, { scopeId: input.folderId ?? "__none__" }]
    },
    include: { workflowDefinition: { select: { name: true, status: true } } },
    orderBy: [{ position: "asc" }, { name: "asc" }]
  });
  return { actions: actions.map(toQuickActionDto) };
}

export async function createQuickAction(actor: ActorContext, input: { name: string; targetType?: string; workflowDefinitionId: string; scopeId?: string | null }): Promise<QuickActionDto> {
  const workflow = await prisma.workflowDefinition.findFirst({ where: { id: input.workflowDefinitionId, tenantId: actor.organizationId, status: "PUBLISHED" } });
  if (!workflow) throw new AppError(404, "WORKFLOW_NOT_FOUND", "The workflow was not found or is not published.");
  if (input.scopeId) {
    const folder = await prisma.folder.findFirst({ where: { id: input.scopeId, tenantId: actor.organizationId, status: "ACTIVE" } });
    if (!folder) throw new AppError(404, "FOLDER_NOT_FOUND", "The scope folder was not found.");
  }
  const action = await prisma.quickAction.create({
    data: { tenantId: actor.organizationId, name: input.name, targetType: input.targetType ?? "document", workflowDefinitionId: input.workflowDefinitionId, scopeId: input.scopeId ?? null },
    include: { workflowDefinition: { select: { name: true, status: true } } }
  });
  return toQuickActionDto(action);
}

export async function deleteQuickAction(actor: ActorContext, actionId: string) {
  const action = await prisma.quickAction.findFirst({ where: { id: actionId, tenantId: actor.organizationId } });
  if (!action) throw new AppError(404, "QUICK_ACTION_NOT_FOUND", "The quick action was not found.");
  await prisma.quickAction.delete({ where: { id: action.id } });
}

export async function runQuickAction(actor: ActorContext, actionId: string, input: { targetId: string }) {
  const action = await prisma.quickAction.findFirst({ where: { id: actionId, tenantId: actor.organizationId } });
  if (!action) throw new AppError(404, "QUICK_ACTION_NOT_FOUND", "The quick action was not found.");
  const target = action.targetType === "folder"
    ? await prisma.folder.findFirst({ where: { id: input.targetId, tenantId: actor.organizationId, status: "ACTIVE" }, select: { id: true, name: true, parentId: true } })
    : await prisma.document.findFirst({ where: { id: input.targetId, tenantId: actor.organizationId, status: "ACTIVE" }, select: { id: true, name: true, folderId: true } });
  if (!target) throw new AppError(404, "TARGET_NOT_FOUND", "The target item was not found.");
  const targetName = target.name;
  const targetFolderId = "folderId" in target ? target.folderId : target.parentId;
  const instance = await startInstance(actor, action.workflowDefinitionId, {
    quickAction: { id: action.id, name: action.name },
    targetType: action.targetType,
    targetId: target.id,
    targetName,
    folderId: targetFolderId
  });
  await notify({
    tenantId: actor.organizationId,
    recipientId: actor.membershipId,
    type: "quick_action.started",
    title: "Ação rápida iniciada",
    body: `A ação "${action.name}" foi iniciada em "${targetName}".`,
    data: { quickActionId: action.id, workflowInstanceId: instance.id }
  });
  return instance;
}
