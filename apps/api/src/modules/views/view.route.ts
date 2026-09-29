import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/auth.guard.js";
import { createView, deleteView, getActor, listViews, updateView } from "./view.service.js";

const resourceTypeSchema = z.enum(["list", "tasks", "documents"]);
const configSchema = z.record(z.string(), z.unknown());

const listViewsSchema = z.object({
  resourceType: resourceTypeSchema,
  resourceId: z.string().min(1).optional()
});

const createViewSchema = z.object({
  resourceType: resourceTypeSchema,
  resourceId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(120),
  config: configSchema.default({}),
  isShared: z.boolean().default(false)
});

const updateViewSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  config: configSchema.optional(),
  isShared: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

function params(request: FastifyRequest) {
  return request.params as { organizationId: string; viewId: string };
}

async function actorFor(request: FastifyRequest) {
  const { organizationId } = params(request);
  return getActor(organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
}

export const viewRoute: FastifyPluginAsync = async (app) => {
  app.get("/organizations/:organizationId/views", { preHandler: authenticate }, async (request) => {
    const query = listViewsSchema.parse(request.query);
    return listViews(await actorFor(request), query);
  });

  app.post("/organizations/:organizationId/views", { preHandler: authenticate }, async (request, reply) => {
    const input = createViewSchema.parse(request.body);
    const view = await createView(await actorFor(request), input);
    return reply.status(201).send(view);
  });

  app.patch("/organizations/:organizationId/views/:viewId", { preHandler: authenticate }, async (request) => {
    const input = updateViewSchema.parse(request.body);
    return updateView(await actorFor(request), params(request).viewId, input);
  });

  app.delete("/organizations/:organizationId/views/:viewId", { preHandler: authenticate }, async (request, reply) => {
    await deleteView(await actorFor(request), params(request).viewId);
    return reply.status(204).send();
  });
};
