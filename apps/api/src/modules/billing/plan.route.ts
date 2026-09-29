import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/auth.guard.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import { permissions } from "../permissions/permissions.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { cancelSubscription, changePlan, createBillingPortalSession, getSubscription, getUsageStats, handleBillingWebhook, listPlans } from "./plan.service.js";

const changePlanSchema = z.object({
  planCode: z.string().min(1).max(40),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]).default("MONTHLY")
});

export const billingRoute: FastifyPluginAsync = async (app) => {
  // Keep the raw JSON body available for Stripe webhook signature verification.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request: FastifyRequest, body, done) => {
    const buffer = body as Buffer;
    (request as FastifyRequest & { rawBody?: Buffer }).rawBody = buffer;
    try {
      done(null, JSON.parse(buffer.toString("utf8")));
    } catch (error) {
      done(error as Error);
    }
  });

  // Public: list available plans
  app.get("/plans", async () => {
    return listPlans();
  });

  // Get current organization subscription (any org member)
  app.get("/organizations/:organizationId/subscription", { preHandler: authenticate }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    // Verify membership
    const membership = await prisma.organizationMember.findFirst({
      where: { tenantId: organizationId, userId: request.auth!.userId, status: "ACTIVE" }
    });
    if (!membership) throw new AppError(403, "FORBIDDEN", "You are not a member of this organization.");
    return getSubscription(organizationId);
  });

  // Get usage stats (any org member)
  app.get("/organizations/:organizationId/usage", { preHandler: authenticate }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    // Verify membership
    const membership = await prisma.organizationMember.findFirst({
      where: { tenantId: organizationId, userId: request.auth!.userId, status: "ACTIVE" }
    });
    if (!membership) throw new AppError(403, "FORBIDDEN", "You are not a member of this organization.");
    return getUsageStats(organizationId);
  });

  // Change plan (org admin only). With a billing provider configured, returns { checkoutUrl } for paid plans.
  app.post("/organizations/:organizationId/subscription", {
    preHandler: [authenticate, requirePermission(permissions.organizationsManage)]
  }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    const input = changePlanSchema.parse(request.body);
    return changePlan(organizationId, input.planCode, input.billingCycle, request.auth!.userId);
  });

  // Stripe billing portal session (org admin only)
  app.post("/organizations/:organizationId/billing-portal", {
    preHandler: [authenticate, requirePermission(permissions.organizationsManage)]
  }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    return createBillingPortalSession(organizationId);
  });

  // Cancel subscription (org admin only)
  app.delete("/organizations/:organizationId/subscription", {
    preHandler: [authenticate, requirePermission(permissions.organizationsManage)]
  }, async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    await cancelSubscription(organizationId);
    return reply.status(204).send();
  });

  // Billing webhook — verified by provider signature over the raw body.
  app.post("/billing/webhook", async (request, reply) => {
    const signature = request.headers["stripe-signature"];
    const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
    if (typeof signature !== "string" || !rawBody) {
      throw new AppError(400, "INVALID_WEBHOOK_REQUEST", "Missing webhook signature or payload.");
    }
    await handleBillingWebhook(rawBody, signature);
    return reply.status(200).send({ received: true });
  });
};
