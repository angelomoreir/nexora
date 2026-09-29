import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import {
  addSiteMember,
  createPage,
  createSite,
  deletePage,
  deleteSite,
  getActor,
  getPage,
  getSite,
  listPages,
  listSites,
  removeSiteMember,
  updatePage,
  updateSite,
  updateSiteMember
} from "./site.service.js";

const siteType = z.enum(["DEPARTMENT", "PROJECT", "TEAM", "HUB"]);
const siteVisibility = z.enum(["ORG", "PRIVATE"]);
const siteRole = z.enum(["ADMIN", "MANAGER", "EDITOR", "CONTRIBUTOR", "VIEWER"]);

const createSiteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: siteType.optional(),
  parentId: z.string().min(1).nullable().optional(),
  description: z.string().trim().max(480).nullable().optional(),
  icon: z.string().trim().max(60).optional(),
  color: z.string().trim().max(20).optional(),
  visibility: siteVisibility.optional()
});

const updateSiteSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(480).nullable().optional(),
  icon: z.string().trim().max(60).optional(),
  color: z.string().trim().max(20).optional(),
  visibility: siteVisibility.optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

const memberSchema = z.object({
  membershipId: z.string().min(1),
  role: siteRole.default("VIEWER")
});

const memberPatchSchema = z.object({ role: siteRole });

const widgetSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.string().trim().min(1).max(40),
  props: z.record(z.string(), z.unknown()).default({})
});

const upsertPageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(120).optional(),
  widgets: z.array(widgetSchema).max(50).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  isHome: z.boolean().optional()
});

const patchPageSchema = upsertPageSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");

const sitesManage = [authenticate, requirePermission(permissions.sitesManage)];

function params(request: FastifyRequest) {
  return request.params as { organizationId: string; siteId: string; membershipId?: string; pageId?: string };
}

async function actorFor(request: FastifyRequest) {
  return getActor(params(request).organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
}

export const siteRoute: FastifyPluginAsync = async (app) => {
  // --- Sites ---
  app.get("/organizations/:organizationId/sites", { preHandler: [authenticate] }, async (request) => {
    return listSites(await actorFor(request));
  });

  app.post("/organizations/:organizationId/sites", { preHandler: sitesManage }, async (request, reply) => {
    return reply.status(201).send(await createSite(await actorFor(request), createSiteSchema.parse(request.body)));
  });

  app.get("/organizations/:organizationId/sites/:siteId", { preHandler: [authenticate] }, async (request) => {
    return getSite(await actorFor(request), params(request).siteId);
  });

  app.patch("/organizations/:organizationId/sites/:siteId", { preHandler: [authenticate] }, async (request) => {
    return updateSite(await actorFor(request), params(request).siteId, updateSiteSchema.parse(request.body));
  });

  app.delete("/organizations/:organizationId/sites/:siteId", { preHandler: [authenticate] }, async (request, reply) => {
    await deleteSite(await actorFor(request), params(request).siteId);
    return reply.status(204).send();
  });

  // --- Members ---
  app.post("/organizations/:organizationId/sites/:siteId/members", { preHandler: [authenticate] }, async (request, reply) => {
    const member = await addSiteMember(await actorFor(request), params(request).siteId, memberSchema.parse(request.body));
    return reply.status(201).send(member);
  });

  app.patch("/organizations/:organizationId/sites/:siteId/members/:membershipId", { preHandler: [authenticate] }, async (request) => {
    const { siteId, membershipId } = params(request);
    return updateSiteMember(await actorFor(request), siteId, membershipId!, memberPatchSchema.parse(request.body).role);
  });

  app.delete("/organizations/:organizationId/sites/:siteId/members/:membershipId", { preHandler: [authenticate] }, async (request, reply) => {
    const { siteId, membershipId } = params(request);
    await removeSiteMember(await actorFor(request), siteId, membershipId!);
    return reply.status(204).send();
  });

  // --- Pages ---
  app.get("/organizations/:organizationId/sites/:siteId/pages", { preHandler: [authenticate] }, async (request) => {
    return listPages(await actorFor(request), params(request).siteId);
  });

  app.post("/organizations/:organizationId/sites/:siteId/pages", { preHandler: [authenticate] }, async (request, reply) => {
    const page = await createPage(await actorFor(request), params(request).siteId, upsertPageSchema.parse(request.body));
    return reply.status(201).send({ page });
  });

  app.get("/organizations/:organizationId/pages/:pageId", { preHandler: [authenticate] }, async (request) => {
    return { page: await getPage(await actorFor(request), params(request).pageId!) };
  });

  app.patch("/organizations/:organizationId/pages/:pageId", { preHandler: [authenticate] }, async (request) => {
    return { page: await updatePage(await actorFor(request), params(request).pageId!, patchPageSchema.parse(request.body)) };
  });

  app.delete("/organizations/:organizationId/pages/:pageId", { preHandler: [authenticate] }, async (request, reply) => {
    await deletePage(await actorFor(request), params(request).pageId!);
    return reply.status(204).send();
  });
};
