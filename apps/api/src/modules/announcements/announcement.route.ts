import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import {
  createAnnouncement,
  deleteAnnouncement,
  getActor,
  listAnnouncements,
  updateAnnouncement
} from "./announcement.service.js";

const listSchema = z.object({ all: z.enum(["true", "false"]).optional() });

const upsertSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  audience: z.string().trim().max(80).regex(/^(ALL|TEAM:.+)$/, "Audience must be ALL or TEAM:<teamId>.").optional(),
  publishAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional()
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(10000).optional(),
  audience: z.string().trim().max(80).regex(/^(ALL|TEAM:.+)$/).optional(),
  publishAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

const announcementsManage = [authenticate, requirePermission(permissions.settingsManage)];

function params(request: FastifyRequest) {
  return request.params as { organizationId: string; announcementId: string };
}

async function actorFor(request: FastifyRequest) {
  return getActor(params(request).organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
}

export const announcementRoute: FastifyPluginAsync = async (app) => {
  app.get("/organizations/:organizationId/announcements", { preHandler: [authenticate] }, async (request) => {
    const { all } = listSchema.parse(request.query);
    return listAnnouncements(await actorFor(request), { all: all === "true" });
  });

  app.post("/organizations/:organizationId/announcements", { preHandler: announcementsManage }, async (request, reply) => {
    return reply.status(201).send(await createAnnouncement(await actorFor(request), upsertSchema.parse(request.body)));
  });

  app.patch("/organizations/:organizationId/announcements/:announcementId", { preHandler: announcementsManage }, async (request) => {
    return updateAnnouncement(await actorFor(request), params(request).announcementId, patchSchema.parse(request.body));
  });

  app.delete("/organizations/:organizationId/announcements/:announcementId", { preHandler: announcementsManage }, async (request, reply) => {
    await deleteAnnouncement(await actorFor(request), params(request).announcementId);
    return reply.status(204).send();
  });
};
