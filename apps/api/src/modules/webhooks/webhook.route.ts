import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import { createWebhook, deleteWebhook, getActor, getWebhook, listDeliveries, listWebhooks, testWebhook, updateWebhook } from "./webhook.service.js";

const webhooksManageGuard = [authenticate, requirePermission(permissions.webhooksManage)];

const createWebhookSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.url().max(2000),
  events: z.array(z.string().trim().min(1).max(100)).min(1).max(50)
});

const updateWebhookSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  url: z.url().max(2000).optional(),
  events: z.array(z.string().trim().min(1).max(100)).min(1).max(50).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

function params(request: FastifyRequest) {
  return request.params as { organizationId: string; webhookId: string };
}

async function actorFor(request: FastifyRequest) {
  const { organizationId } = params(request);
  return getActor(organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
}

export const webhookRoute: FastifyPluginAsync = async (app) => {
  app.get("/organizations/:organizationId/webhooks", { preHandler: webhooksManageGuard }, async (request) => {
    return listWebhooks(await actorFor(request));
  });

  app.post("/organizations/:organizationId/webhooks", { preHandler: webhooksManageGuard }, async (request, reply) => {
    const created = await createWebhook(await actorFor(request), createWebhookSchema.parse(request.body));
    return reply.status(201).send(created);
  });

  app.get("/organizations/:organizationId/webhooks/:webhookId", { preHandler: webhooksManageGuard }, async (request) => {
    return getWebhook(await actorFor(request), params(request).webhookId);
  });

  app.patch("/organizations/:organizationId/webhooks/:webhookId", { preHandler: webhooksManageGuard }, async (request) => {
    return updateWebhook(await actorFor(request), params(request).webhookId, updateWebhookSchema.parse(request.body));
  });

  app.delete("/organizations/:organizationId/webhooks/:webhookId", { preHandler: webhooksManageGuard }, async (request, reply) => {
    await deleteWebhook(await actorFor(request), params(request).webhookId);
    return reply.status(204).send();
  });

  app.get("/organizations/:organizationId/webhooks/:webhookId/deliveries", { preHandler: webhooksManageGuard }, async (request) => {
    return listDeliveries(await actorFor(request), params(request).webhookId);
  });

  app.post("/organizations/:organizationId/webhooks/:webhookId/test", { preHandler: webhooksManageGuard }, async (request, reply) => {
    return reply.status(201).send(await testWebhook(await actorFor(request), params(request).webhookId));
  });
};
