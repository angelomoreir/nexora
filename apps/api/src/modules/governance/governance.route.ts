import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import { accessReview, getActor, governanceReport } from "./governance.service.js";

const auditView = [authenticate, requirePermission(permissions.auditView)];

const reportSchema = z.object({
  inactiveDays: z.coerce.number().int().min(1).max(3650).optional()
});

function params(request: FastifyRequest) {
  return request.params as { organizationId: string; kind: string; id: string };
}

async function actorFor(request: FastifyRequest) {
  return getActor(params(request).organizationId, request.auth!.userId, request.auth!.isSuperAdmin);
}

export const governanceRoute: FastifyPluginAsync = async (app) => {
  app.get("/organizations/:organizationId/access-review/:kind/:id", { preHandler: auditView }, async (request) => {
    const { kind, id } = params(request);
    if (kind !== "document" && kind !== "folder") throw new AppError(400, "VALIDATION_ERROR", "Kind must be document or folder.");
    return accessReview(await actorFor(request), kind, id);
  });

  app.get("/organizations/:organizationId/governance/report", { preHandler: auditView }, async (request) => {
    return governanceReport(await actorFor(request), reportSchema.parse(request.query));
  });
};
