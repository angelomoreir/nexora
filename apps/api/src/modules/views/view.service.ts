import type { CreateSavedViewInput, SavedViewConfig, SavedViewDto, SavedViewResourceType, SavedViewsResponse, UpdateSavedViewInput } from "@nexora/contracts";
import type { SavedView } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma, transactionOptions } from "../../lib/prisma.js";
import { permissions } from "../permissions/permissions.js";

interface ActorContext {
  organizationId: string;
  userId: string;
  membershipId: string;
  isSuperAdmin: boolean;
  capabilities: Set<string>;
}

const MAX_VIEWS_PER_RESOURCE = 50;

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

function parseConfig(configJson: string): SavedViewConfig {
  try {
    const parsed = JSON.parse(configJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as SavedViewConfig : {};
  } catch {
    return {};
  }
}

function toDto(view: SavedView): SavedViewDto {
  return {
    id: view.id,
    resourceType: view.resourceType as SavedViewResourceType,
    resourceId: view.resourceId,
    name: view.name,
    isShared: view.isShared,
    config: parseConfig(view.configJson),
    createdByMembershipId: view.createdByMembershipId,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString()
  };
}

async function audit(actor: ActorContext, action: string, resourceId: string, context?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      tenantId: actor.organizationId,
      actorId: actor.membershipId,
      action,
      resourceType: "SavedView",
      resourceId,
      contextJson: context ? JSON.stringify(context) : null
    }
  });
}

export async function listViews(actor: ActorContext, input: { resourceType: SavedViewResourceType; resourceId?: string | null }): Promise<SavedViewsResponse> {
  const views = await prisma.savedView.findMany({
    where: {
      tenantId: actor.organizationId,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      OR: [{ createdByMembershipId: actor.membershipId }, { isShared: true }]
    },
    orderBy: { createdAt: "asc" }
  });
  return { views: views.map(toDto) };
}

export async function createView(actor: ActorContext, input: CreateSavedViewInput): Promise<SavedViewDto> {
  const resourceId = input.resourceId ?? null;
  const count = await prisma.savedView.count({
    where: { tenantId: actor.organizationId, createdByMembershipId: actor.membershipId, resourceType: input.resourceType, resourceId }
  });
  if (count >= MAX_VIEWS_PER_RESOURCE) {
    throw new AppError(409, "VIEW_LIMIT_REACHED", "You reached the maximum number of saved views for this resource.");
  }
  const view = await prisma.savedView.create({
    data: {
      tenantId: actor.organizationId,
      createdByMembershipId: actor.membershipId,
      resourceType: input.resourceType,
      resourceId,
      name: input.name,
      isShared: input.isShared ?? false,
      configJson: JSON.stringify(input.config ?? {})
    }
  });
  await audit(actor, "view.created", view.id, { name: view.name, resourceType: view.resourceType });
  return toDto(view);
}

function canManage(actor: ActorContext, view: SavedView) {
  return view.createdByMembershipId === actor.membershipId || actor.isSuperAdmin || actor.capabilities.has(permissions.organizationsManage);
}

export async function updateView(actor: ActorContext, viewId: string, input: UpdateSavedViewInput): Promise<SavedViewDto> {
  const view = await prisma.savedView.findFirst({ where: { id: viewId, tenantId: actor.organizationId } });
  if (!view) throw new AppError(404, "VIEW_NOT_FOUND", "The saved view was not found.");
  if (!canManage(actor, view)) throw new AppError(403, "FORBIDDEN", "You can only update your own saved views.");
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.savedView.update({
      where: { id: view.id },
      data: {
        name: input.name,
        isShared: input.isShared,
        configJson: input.config !== undefined ? JSON.stringify(input.config) : undefined
      }
    });
    await transaction.auditLog.create({
      data: { tenantId: actor.organizationId, actorId: actor.membershipId, action: "view.updated", resourceType: "SavedView", resourceId: view.id }
    });
    return result;
  }, transactionOptions);
  return toDto(updated);
}

export async function deleteView(actor: ActorContext, viewId: string): Promise<void> {
  const view = await prisma.savedView.findFirst({ where: { id: viewId, tenantId: actor.organizationId } });
  if (!view) throw new AppError(404, "VIEW_NOT_FOUND", "The saved view was not found.");
  if (!canManage(actor, view)) throw new AppError(403, "FORBIDDEN", "You can only delete your own saved views.");
  await prisma.$transaction(async (transaction) => {
    await transaction.savedView.delete({ where: { id: view.id } });
    await transaction.auditLog.create({
      data: { tenantId: actor.organizationId, actorId: actor.membershipId, action: "view.deleted", resourceType: "SavedView", resourceId: view.id }
    });
  }, transactionOptions);
}
