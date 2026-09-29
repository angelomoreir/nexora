import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { PermissionKey } from "./permissions.js";

export function requirePermission(permission: PermissionKey) {
  return async function authorize(request: FastifyRequest, _reply: FastifyReply) {
    if (!request.auth) {
      throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
    }
    if (request.auth.isSuperAdmin) {
      return;
    }

    const organizationId = (request.params as { organizationId?: string }).organizationId;
    if (!organizationId) {
      throw new AppError(400, "ORGANIZATION_REQUIRED", "An organization is required.");
    }

    const membership = await prisma.organizationMember.findFirst({
      where: {
        tenantId: organizationId,
        userId: request.auth.userId,
        status: "ACTIVE",
        tenant: { status: "ACTIVE" },
        membershipRoles: {
          some: {
            role: {
              permissions: {
                some: { permission: { key: permission } }
              }
            }
          }
        }
      }
    });

    if (!membership) {
      throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action.");
    }
  };
}
