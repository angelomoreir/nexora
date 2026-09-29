import type { CollaborationMembersResponse } from "@nexora/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../auth/auth.guard.js";

const membersQuerySchema = z.object({
  q: z.string().trim().max(100).optional()
});

export const collaborationRoute: FastifyPluginAsync = async (app) => {
  app.get("/organizations/:organizationId/collaboration/members", { preHandler: [authenticate] }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    const { q } = membersQuerySchema.parse(request.query);

    const membership = await prisma.organizationMember.findFirst({
      where: { tenantId: organizationId, userId: request.auth!.userId, status: "ACTIVE", tenant: { status: "ACTIVE" } }
    });
    if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");

    const members = await prisma.organizationMember.findMany({
      where: { tenantId: organizationId, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true, avatar: true } } }
    });
    const needle = q ? q.toLowerCase() : null;
    const filtered = members
      .filter((member) => !needle || member.user.name.toLowerCase().includes(needle))
      .sort((a, b) => a.user.name.localeCompare(b.user.name))
      .slice(0, 50)
      .map((member) => ({ membershipId: member.id, userId: member.user.id, name: member.user.name, avatar: member.user.avatar }));
    return { members: filtered } satisfies CollaborationMembersResponse;
  });
};
