import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import { addTeamMember, createTeam, deleteTeam, getTeam, listTeams, removeTeamMember, updateTeam } from "./team.service.js";

const createTeamSchema = z.object({ name: z.string().trim().min(2).max(80), description: z.string().max(500).optional() });
const updateTeamSchema = z.object({ name: z.string().trim().min(2).max(80).optional(), description: z.string().max(500).optional() });
const memberSchema = z.object({ membershipId: z.string().min(1) });

async function buildActor(organizationId: string, userId: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: { tenantId: organizationId, userId, status: "ACTIVE", tenant: { status: "ACTIVE" } }
  });
  if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");
  return membership.id;
}

export const teamRoute: FastifyPluginAsync = async (app) => {
  app.get("/organizations/:organizationId/teams", { preHandler: [authenticate, requirePermission(permissions.usersRead)] }, async (request) => {
    const { organizationId } = request.params as { organizationId: string };
    return listTeams(organizationId);
  });

  app.get("/organizations/:organizationId/teams/:teamId", { preHandler: [authenticate, requirePermission(permissions.usersRead)] }, async (request) => {
    const { organizationId, teamId } = request.params as { organizationId: string; teamId: string };
    return getTeam(organizationId, teamId);
  });

  app.post("/organizations/:organizationId/teams", { preHandler: [authenticate, requirePermission(permissions.rolesManage)] }, async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    const input = createTeamSchema.parse(request.body);
    const actorId = await buildActor(organizationId, request.auth!.userId);
    const team = await createTeam(organizationId, actorId, input);
    return reply.status(201).send(team);
  });

  app.patch("/organizations/:organizationId/teams/:teamId", { preHandler: [authenticate, requirePermission(permissions.rolesManage)] }, async (request) => {
    const { organizationId, teamId } = request.params as { organizationId: string; teamId: string };
    const input = updateTeamSchema.parse(request.body);
    const actorId = await buildActor(organizationId, request.auth!.userId);
    return updateTeam(organizationId, actorId, teamId, input);
  });

  app.delete("/organizations/:organizationId/teams/:teamId", { preHandler: [authenticate, requirePermission(permissions.rolesManage)] }, async (request, reply) => {
    const { organizationId, teamId } = request.params as { organizationId: string; teamId: string };
    const actorId = await buildActor(organizationId, request.auth!.userId);
    await deleteTeam(organizationId, actorId, teamId);
    return reply.status(204).send();
  });

  app.post("/organizations/:organizationId/teams/:teamId/members", { preHandler: [authenticate, requirePermission(permissions.rolesManage)] }, async (request, reply) => {
    const { organizationId, teamId } = request.params as { organizationId: string; teamId: string };
    const { membershipId } = memberSchema.parse(request.body);
    const actorId = await buildActor(organizationId, request.auth!.userId);
    await addTeamMember(organizationId, actorId, teamId, membershipId);
    return reply.status(204).send();
  });

  app.delete("/organizations/:organizationId/teams/:teamId/members/:membershipId", { preHandler: [authenticate, requirePermission(permissions.rolesManage)] }, async (request, reply) => {
    const { organizationId, teamId, membershipId } = request.params as { organizationId: string; teamId: string; membershipId: string };
    const actorId = await buildActor(organizationId, request.auth!.userId);
    await removeTeamMember(organizationId, actorId, teamId, membershipId);
    return reply.status(204).send();
  });
};
