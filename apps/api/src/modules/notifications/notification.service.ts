import type { NotificationDto, NotificationsResponse, UnreadCountResponse } from "@nexora/contracts";
import type { Notification } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { publishMemberEvent } from "../collaboration/realtime.service.js";

// --- Centralized notification dispatcher ---
// Used by all modules to create notifications. Prepares NotificationDelivery
// records for future email/push channels (currently IN_APP only).

export type NotificationType =
  | "task.assigned"
  | "task.commented"
  | "user.mentioned"
  | "document.shared"
  | "document.changed"
  | "workflow.approval"
  | "workflow.approval.decided"
  | "workflow.completed"
  | "workflow.notification";

export interface NotifyInput {
  tenantId: string;
  recipientId: string;
  type: NotificationType | string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function notify(input: NotifyInput): Promise<Notification> {
  const notification = await prisma.notification.create({
    data: {
      tenantId: input.tenantId,
      recipientId: input.recipientId,
      type: input.type,
      title: input.title,
      body: input.body,
      dataJson: input.data ? JSON.stringify(input.data) : null,
      deliveries: { create: [{ tenantId: input.tenantId, channel: "IN_APP", status: "DELIVERED", deliveredAt: new Date() }] }
    }
  });
  publishMemberEvent(input.tenantId, input.recipientId, "notification.created");
  return notification;
}

// --- DTO mapper ---

function toDto(notification: Notification): NotificationDto {
  let data: Record<string, unknown> | null = null;
  if (notification.dataJson) {
    try { data = JSON.parse(notification.dataJson); } catch { data = null; }
  }
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString()
  };
}

// --- Service functions ---

export async function listNotifications(organizationId: string, membershipId: string, filters: { unreadOnly?: boolean; type?: string }): Promise<NotificationsResponse> {
  const where = {
    tenantId: organizationId,
    recipientId: membershipId,
    readAt: filters.unreadOnly ? null : undefined,
    type: filters.type || undefined
  };
  const [notifications, unreadCount, total] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.notification.count({ where: { tenantId: organizationId, recipientId: membershipId, readAt: null } }),
    prisma.notification.count({ where })
  ]);
  return { notifications: notifications.map(toDto), total, unreadCount };
}

export async function getUnreadCount(organizationId: string, membershipId: string): Promise<UnreadCountResponse> {
  const unreadCount = await prisma.notification.count({ where: { tenantId: organizationId, recipientId: membershipId, readAt: null } });
  return { unreadCount };
}

export async function markAsRead(organizationId: string, membershipId: string, notificationId: string): Promise<void> {
  const notification = await prisma.notification.findFirst({ where: { id: notificationId, tenantId: organizationId, recipientId: membershipId } });
  if (!notification) throw new AppError(404, "NOTIFICATION_NOT_FOUND", "The notification was not found.");
  if (!notification.readAt) {
    await prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
    publishMemberEvent(organizationId, membershipId, "notification.updated");
  }
}

export async function markAllAsRead(organizationId: string, membershipId: string): Promise<void> {
  const result = await prisma.notification.updateMany({ where: { tenantId: organizationId, recipientId: membershipId, readAt: null }, data: { readAt: new Date() } });
  if (result.count > 0) publishMemberEvent(organizationId, membershipId, "notification.updated");
}

export interface ResolvedMention {
  membershipId: string;
  userId: string;
  name: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export async function resolveMentions(organizationId: string, text: string, requiredPermission?: string): Promise<ResolvedMention[]> {
  const members = await prisma.organizationMember.findMany({
    where: { tenantId: organizationId, status: "ACTIVE" },
    include: {
      user: { select: { id: true, name: true, isSuperAdmin: true } },
      membershipRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }
    }
  });
  const eligible = members.filter((member) => {
    if (!requiredPermission) return true;
    if (member.user.isSuperAdmin) return true;
    return member.membershipRoles.some((memberRole) => memberRole.role.permissions.some((rolePermission) => rolePermission.permission.key === requiredPermission));
  });

  const resolved = new Map<string, ResolvedMention>();
  const fullNameRanges: Array<[number, number]> = [];
  const longestFirst = [...eligible].sort((a, b) => b.user.name.length - a.user.name.length);
  for (const member of longestFirst) {
    const name = member.user.name.trim();
    if (!name) continue;
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])@${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}_])`, "giu");
    for (const match of text.matchAll(pattern)) {
      resolved.set(member.id, { membershipId: member.id, userId: member.user.id, name: member.user.name });
      const prefixLength = match[1]?.length ?? 0;
      const start = (match.index ?? 0) + prefixLength;
      fullNameRanges.push([start, start + match[0].length - prefixLength]);
    }
  }

  const tokens = [...text.matchAll(/(^|[^\p{L}\p{N}_])@([\p{L}\p{N}_.]+)/gu)]
    .map((match) => ({ atIndex: (match.index ?? 0) + (match[1]?.length ?? 0), token: match[2] }))
    .filter((entry): entry is { atIndex: number; token: string } => Boolean(entry.token))
    .filter((entry) => !fullNameRanges.some(([start, end]) => entry.atIndex >= start && entry.atIndex < end))
    .map((entry) => entry.token);
  for (const token of tokens) {
    const needle = normalizeName(token);
    for (const candidate of eligible) {
      if (resolved.has(candidate.id)) continue;
      const full = normalizeName(candidate.user.name.trim());
      const first = normalizeName(candidate.user.name.trim().split(/\s+/)[0] ?? "");
      if (first === needle || full === needle) {
        resolved.set(candidate.id, { membershipId: candidate.id, userId: candidate.user.id, name: candidate.user.name });
      }
    }
  }
  return [...resolved.values()];
}
