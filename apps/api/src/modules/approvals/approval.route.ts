import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/auth.guard.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import { permissions } from "../permissions/permissions.js";
import { addComment, delegateApproval, getActor, getApproval, listApprovals } from "./approval.service.js";
import { openRealtimeStream } from "../collaboration/realtime.service.js";

const approvalsView = [authenticate, requirePermission(permissions.approvalsView)];
const approvalsManage = [authenticate, requirePermission(permissions.approvalsManage)];

const listApprovalsSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  scope: z.enum(["mine", "all"]).optional()
});

const addCommentSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const delegateSchema = z.object({ toMemberId: z.string().trim().min(1), reason: z.string().trim().max(1000).optional() });

function params(request: FastifyRequest) {
  return request.params as { organizationId: string; approvalId: string };
}

async function actorFor(request: FastifyRequest) {
  const { organizationId } = params(request);
  return getActor(organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
}

export const approvalRoute: FastifyPluginAsync = async (app) => {
  app.get("/organizations/:organizationId/approvals", { preHandler: approvalsView }, async (request) => {
    return listApprovals(await actorFor(request), listApprovalsSchema.parse(request.query));
  });

  app.get("/organizations/:organizationId/approvals/:approvalId", { preHandler: approvalsView }, async (request) => {
    return getApproval(await actorFor(request), params(request).approvalId);
  });

  app.get(
    "/organizations/:organizationId/approvals/:approvalId/events",
    { preHandler: approvalsView, config: { rateLimit: false } },
    async (request, reply) => {
      const actor = await actorFor(request);
      const approvalId = params(request).approvalId;
      await getApproval(actor, approvalId);
      await openRealtimeStream(request, reply, {
        tenantId: actor.organizationId,
        membershipId: actor.membershipId,
        userId: actor.userId,
        resource: { type: "approval", id: approvalId }
      });
    }
  );

  app.post("/organizations/:organizationId/approvals/:approvalId/comments", { preHandler: approvalsView }, async (request, reply) => {
    const { body } = addCommentSchema.parse(request.body);
    return reply.status(201).send(await addComment(await actorFor(request), params(request).approvalId, body));
  });

  app.post("/organizations/:organizationId/approvals/:approvalId/delegate", { preHandler: approvalsManage }, async (request) => {
    const { toMemberId, reason } = delegateSchema.parse(request.body);
    return delegateApproval(await actorFor(request), params(request).approvalId, toMemberId, reason);
  });
};
