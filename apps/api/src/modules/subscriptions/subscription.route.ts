import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/auth.guard.js";
import { getActor, isSubscribed, listMySubscriptions, subscribe, SUBSCRIPTION_EVENTS, unsubscribe } from "./subscription.service.js";

const targetTypeSchema = z.enum(["folder", "document", "list", "task", "project"]);

const subscribeSchema = z.object({
  targetType: targetTypeSchema,
  targetId: z.string().min(1).max(120),
  events: z.array(z.enum(SUBSCRIPTION_EVENTS)).min(1).max(SUBSCRIPTION_EVENTS.length)
});

const unsubscribeSchema = z.object({
  targetType: targetTypeSchema,
  targetId: z.string().min(1).max(120)
});

const checkSchema = z.object({
  targetType: targetTypeSchema,
  targetId: z.string().min(1).max(120)
});

function params(request: FastifyRequest) {
  return request.params as { organizationId: string };
}

async function actorFor(request: FastifyRequest) {
  const { organizationId } = params(request);
  return getActor(organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
}

export const subscriptionRoute: FastifyPluginAsync = async (app) => {
  app.post("/organizations/:organizationId/subscriptions", { preHandler: authenticate }, async (request, reply) => {
    const input = subscribeSchema.parse(request.body);
    const subscription = await subscribe(await actorFor(request), input);
    return reply.status(201).send(subscription);
  });

  app.delete("/organizations/:organizationId/subscriptions", { preHandler: authenticate }, async (request, reply) => {
    const input = unsubscribeSchema.parse(request.body);
    await unsubscribe(await actorFor(request), input.targetType, input.targetId);
    return reply.status(204).send();
  });

  app.get("/organizations/:organizationId/subscriptions/mine", { preHandler: authenticate }, async (request) => {
    return listMySubscriptions(await actorFor(request));
  });

  app.get("/organizations/:organizationId/subscriptions/check", { preHandler: authenticate }, async (request) => {
    const input = checkSchema.parse(request.query);
    return { subscribed: await isSubscribed(await actorFor(request), input.targetType, input.targetId) };
  });
};
