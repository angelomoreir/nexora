import type { AnnouncementDto, AnnouncementsResponse } from "@nexora/contracts";
import type { Announcement } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

async function audit(actor: ActorContext, action: string, resourceId: string, context?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      tenantId: actor.organizationId,
      actorId: actor.membershipId,
      action,
      resourceType: "Announcement",
      resourceId,
      contextJson: JSON.stringify(context ?? {})
    }
  });
}

export interface ActorContext {
  organizationId: string;
  userId: string;
  membershipId: string;
  isSuperAdmin: boolean;
  capabilities: Set<string>;
}

export async function getActor(organizationId: string, userId: string, isSuperAdmin: boolean): Promise<ActorContext> {
  const membership = await prisma.organizationMember.findFirst({
    where: { tenantId: organizationId, userId, status: "ACTIVE", tenant: { status: "ACTIVE" } },
    include: { membershipRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
  });
  if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");
  const capabilities = new Set<string>();
  for (const memberRole of membership.membershipRoles) {
    for (const rolePermission of memberRole.role.permissions) capabilities.add(rolePermission.permission.key);
  }
  return { organizationId, userId, membershipId: membership.id, isSuperAdmin, capabilities };
}

type AnnouncementWithAuthor = Announcement & { createdBy: { user: { name: string } } };

function toDto(announcement: AnnouncementWithAuthor): AnnouncementDto {
  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    audience: announcement.audience,
    publishAt: announcement.publishAt.toISOString(),
    expiresAt: announcement.expiresAt?.toISOString() ?? null,
    author: announcement.createdBy.user.name,
    createdAt: announcement.createdAt.toISOString()
  };
}

const authorInclude = { createdBy: { include: { user: { select: { name: true } } } } } as const;

// Members see only published, unexpired announcements targeted at them
// (ALL or a team they belong to). Managers see everything via `all=true`.
export async function listAnnouncements(actor: ActorContext, input: { all?: boolean }): Promise<AnnouncementsResponse> {
  const canManage = actor.isSuperAdmin || actor.capabilities.has("settings.manage");
  if (input.all && canManage) {
    const announcements = await prisma.announcement.findMany({
      where: { tenantId: actor.organizationId },
      include: authorInclude,
      orderBy: { publishAt: "desc" }
    });
    return { announcements: announcements.map(toDto) };
  }
  const teams = await prisma.teamMember.findMany({ where: { membershipId: actor.membershipId }, select: { teamId: true } });
  const audiences = ["ALL", ...teams.map(({ teamId }) => `TEAM:${teamId}`)];
  const now = new Date();
  const announcements = await prisma.announcement.findMany({
    where: {
      tenantId: actor.organizationId,
      audience: { in: audiences },
      publishAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    },
    include: authorInclude,
    orderBy: { publishAt: "desc" },
    take: 50
  });
  return { announcements: announcements.map(toDto) };
}

export async function createAnnouncement(actor: ActorContext, input: { title: string; body: string; audience?: string; publishAt?: string; expiresAt?: string | null }): Promise<AnnouncementDto> {
  if (input.audience?.startsWith("TEAM:")) {
    const team = await prisma.team.findFirst({ where: { id: input.audience.slice(5), tenantId: actor.organizationId } });
    if (!team) throw new AppError(404, "TEAM_NOT_FOUND", "The audience team was not found.");
  }
  const announcement = await prisma.announcement.create({
    data: {
      tenantId: actor.organizationId,
      title: input.title,
      body: input.body,
      audience: input.audience ?? "ALL",
      publishAt: input.publishAt ? new Date(input.publishAt) : new Date(),
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdById: actor.membershipId
    },
    include: authorInclude
  });
  await audit(actor, "announcement.created", announcement.id, { title: announcement.title, audience: announcement.audience });
  return toDto(announcement);
}

export async function updateAnnouncement(actor: ActorContext, announcementId: string, input: { title?: string; body?: string; audience?: string; publishAt?: string; expiresAt?: string | null }): Promise<AnnouncementDto> {
  const existing = await prisma.announcement.findFirst({ where: { id: announcementId, tenantId: actor.organizationId } });
  if (!existing) throw new AppError(404, "ANNOUNCEMENT_NOT_FOUND", "The announcement was not found.");
  const announcement = await prisma.announcement.update({
    where: { id: existing.id },
    data: {
      title: input.title,
      body: input.body,
      audience: input.audience,
      publishAt: input.publishAt ? new Date(input.publishAt) : undefined,
      expiresAt: input.expiresAt === null ? null : input.expiresAt ? new Date(input.expiresAt) : undefined
    },
    include: authorInclude
  });
  await audit(actor, "announcement.updated", announcement.id, { title: announcement.title });
  return toDto(announcement);
}

export async function deleteAnnouncement(actor: ActorContext, announcementId: string) {
  const existing = await prisma.announcement.findFirst({ where: { id: announcementId, tenantId: actor.organizationId } });
  if (!existing) throw new AppError(404, "ANNOUNCEMENT_NOT_FOUND", "The announcement was not found.");
  await prisma.announcement.delete({ where: { id: existing.id } });
  await audit(actor, "announcement.deleted", announcementId, {});
}
