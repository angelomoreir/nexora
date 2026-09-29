import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import { addNewsComment, createNews, deleteNews, getActor, getNews, listNews, removeNewsComment, updateNews } from "./news.service.js";
import { openRealtimeStream } from "../collaboration/realtime.service.js";

const newsStatus = z.enum(["DRAFT", "PUBLISHED", "SCHEDULED"]);

const listSchema = z.object({
  siteId: z.string().min(1).optional(),
  status: newsStatus.optional()
});

const upsertSchema = z.object({
  title: z.string().trim().min(2).max(200),
  excerpt: z.string().trim().max(480).nullable().optional(),
  body: z.string().max(50000).optional(),
  siteId: z.string().min(1).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  coverColor: z.string().trim().max(20).optional(),
  status: newsStatus.optional(),
  featured: z.boolean().optional(),
  publishedAt: z.string().datetime().nullable().optional()
});

const patchSchema = upsertSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");

const commentSchema = z.object({ body: z.string().trim().min(1).max(4000) });

const newsView = [authenticate, requirePermission(permissions.newsView)];

function params(request: FastifyRequest) {
  return request.params as { organizationId: string; newsId: string };
}

async function actorFor(request: FastifyRequest) {
  return getActor(params(request).organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
}

export const newsRoute: FastifyPluginAsync = async (app) => {
  app.get("/organizations/:organizationId/news", { preHandler: newsView }, async (request) => {
    const { siteId, status } = listSchema.parse(request.query);
    return listNews(await actorFor(request), { siteId, status });
  });

  app.post("/organizations/:organizationId/news", { preHandler: [authenticate] }, async (request, reply) => {
    return reply.status(201).send({ post: await createNews(await actorFor(request), upsertSchema.parse(request.body)) });
  });

  app.get("/organizations/:organizationId/news/:newsId", { preHandler: newsView }, async (request) => {
    return getNews(await actorFor(request), params(request).newsId);
  });

  app.get(
    "/organizations/:organizationId/news/:newsId/events",
    { preHandler: newsView, config: { rateLimit: false } },
    async (request, reply) => {
      const actor = await actorFor(request);
      const newsId = params(request).newsId;
      await getNews(actor, newsId);
      await openRealtimeStream(request, reply, {
        tenantId: actor.organizationId,
        membershipId: actor.membershipId,
        userId: actor.userId,
        resource: { type: "news", id: newsId }
      });
    }
  );

  app.patch("/organizations/:organizationId/news/:newsId", { preHandler: [authenticate] }, async (request) => {
    return { post: await updateNews(await actorFor(request), params(request).newsId, patchSchema.parse(request.body)) };
  });

  app.delete("/organizations/:organizationId/news/:newsId", { preHandler: [authenticate] }, async (request, reply) => {
    await deleteNews(await actorFor(request), params(request).newsId);
    return reply.status(204).send();
  });

  app.post("/organizations/:organizationId/news/:newsId/comments", { preHandler: newsView }, async (request, reply) => {
    const comment = await addNewsComment(await actorFor(request), params(request).newsId, commentSchema.parse(request.body).body);
    return reply.status(201).send(comment);
  });

  app.delete("/organizations/:organizationId/news/:newsId/comments/:commentId", { preHandler: newsView }, async (request, reply) => {
    const { newsId, commentId } = request.params as { organizationId: string; newsId: string; commentId: string };
    await removeNewsComment(await actorFor(request), newsId, commentId);
    return reply.status(204).send();
  });
};
