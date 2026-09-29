import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import { listAuditLogs } from "./audit.service.js";

const auditListSchema = z.object({
  action: z.string().max(100).optional(),
  resourceType: z.string().max(60).optional(),
  actorId: z.string().optional(),
  result: z.string().max(30).optional(),
  after: z.string().datetime().optional(),
  before: z.string().datetime().optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional()
});

export const auditRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/organizations/:organizationId/audit",
    { preHandler: [authenticate, requirePermission(permissions.auditView)] },
    async (request) => {
      const { organizationId } = request.params as { organizationId: string };
      const filters = auditListSchema.parse(request.query);
      return listAuditLogs(organizationId, filters);
    }
  );
};
