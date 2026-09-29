import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { SearchFilters } from "@nexora/contracts";
import { authenticate } from "../auth/auth.guard.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { search, type SearchActor } from "./search.service.js";

const searchSchema = z.object({
  q: z.string().trim().min(1).max(200),
  types: z.string().optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  createdBy: z.string().optional(),
  teamId: z.string().optional(),
  status: z.string().max(60).optional(),
  mimeType: z.string().trim().max(100).optional(),
  sensitivity: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]).optional(),
  publishStatus: z.enum(["PUBLISHED", "DRAFT", "PENDING", "REJECTED"]).optional(),
  meta: z.string().trim().max(200).optional()
});

async function buildActor(organizationId: string, userId: string, isSuperAdmin: boolean): Promise<SearchActor> {
  const membership = await prisma.organizationMember.findFirst({
    where: { tenantId: organizationId, userId, status: "ACTIVE", tenant: { status: "ACTIVE" } },
    include: { membershipRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
  });
  if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");
  return {
    organizationId,
    userId,
    membershipId: membership.id,
    isSuperAdmin,
    capabilities: new Set(membership.membershipRoles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))
  };
}

export const searchRoute: FastifyPluginAsync = async (app) => {
  app.get("/organizations/:organizationId/search", { preHandler: authenticate }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    const parsed = searchSchema.parse(request.query);
    const actor = await buildActor(organizationId, request.auth!.userId, request.auth!.isSuperAdmin);

    const types = parsed.types ? (parsed.types.split(",") as SearchFilters["types"]) : undefined;
    const filters: SearchFilters = {
      types,
      createdAfter: parsed.createdAfter,
      createdBefore: parsed.createdBefore,
      createdBy: parsed.createdBy,
      teamId: parsed.teamId,
      status: parsed.status,
      mimeType: parsed.mimeType,
      sensitivity: parsed.sensitivity,
      publishStatus: parsed.publishStatus,
      meta: parsed.meta
    };

    return search(actor, parsed.q, filters);
  });
};
