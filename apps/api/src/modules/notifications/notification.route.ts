import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/auth.guard.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import { permissions } from "../permissions/permissions.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getUnreadCount, listNotifications, markAllAsRead, markAsRead } from "./notification.service.js";
import { openRealtimeStream } from "../collaboration/realtime.service.js";

const notificationsView = [authenticate, requirePermission(permissions.notificationsView)];

const listNotificationsSchema = z.object({
  unreadOnly: z.enum(["true", "false"]).optional(),
  type: z.string().max(60).optional()
});

function params(request: FastifyRequest) {
  return request.params as { organizationId: string; notificationId: string };
}

async function resolveMembership(organizationId: string, userId: string): Promise<string> {
  const membership = await prisma.organizationMember.findFirst({ where: { tenantId: organizationId, userId, status: "ACTIVE", tenant: { status: "ACTIVE" } } });
  if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");
  return membership.id;
}

export const notificationRoute: FastifyPluginAsync = async (app) => {
  app.get("/organizations/:organizationId/notifications", { preHandler: notificationsView }, async (request) => {
    const { organizationId } = params(request);
    const membershipId = await resolveMembership(organizationId, request.auth!.userId);
    const parsed = listNotificationsSchema.parse(request.query);
    return listNotifications(organizationId, membershipId, { unreadOnly: parsed.unreadOnly === "true", type: parsed.type });
  });

  app.get("/organizations/:organizationId/notifications/unread-count", { preHandler: notificationsView }, async (request) => {
    const { organizationId } = params(request);
    const membershipId = await resolveMembership(organizationId, request.auth!.userId);
    return getUnreadCount(organizationId, membershipId);
  });

  app.get(
    "/organizations/:organizationId/notifications/events",
    { preHandler: notificationsView, config: { rateLimit: false } },
    async (request, reply) => {
      const { organizationId } = params(request);
      const membershipId = await resolveMembership(organizationId, request.auth!.userId);
      await openRealtimeStream(request, reply, {
        tenantId: organizationId,
        membershipId,
        userId: request.auth!.userId
      });
    }
  );

  app.post("/organizations/:organizationId/notifications/:notificationId/read", { preHandler: notificationsView }, async (request, reply) => {
    const { organizationId, notificationId } = params(request);
    const membershipId = await resolveMembership(organizationId, request.auth!.userId);
    await markAsRead(organizationId, membershipId, notificationId);
    return reply.status(204).send();
  });

  app.post("/organizations/:organizationId/notifications/read-all", { preHandler: notificationsView }, async (request, reply) => {
    const { organizationId } = params(request);
    const membershipId = await resolveMembership(organizationId, request.auth!.userId);
    await markAllAsRead(organizationId, membershipId);
    return reply.status(204).send();
  });
};
