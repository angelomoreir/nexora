import type { CreateTeamDto, TeamDetailDto, TeamDto, UpdateTeamDto } from "@nexora/contracts";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

export async function listTeams(organizationId: string): Promise<TeamDto[]> {
  const teams = await prisma.team.findMany({
    where: { tenantId: organizationId },
    include: { _count: { select: { members: true } } },
    orderBy: { name: "asc" }
  });
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    memberCount: t._count.members,
    createdAt: t.createdAt.toISOString()
  }));
}

export async function getTeam(organizationId: string, teamId: string): Promise<TeamDetailDto> {
  const team = await prisma.team.findFirst({
    where: { id: teamId, tenantId: organizationId },
    include: {
      members: {
        include: {
          membership: {
            include: {
              user: { select: { name: true, email: true } },
              membershipRoles: { include: { role: { select: { name: true } } } }
            }
          }
        }
      }
    }
  });
  if (!team) throw new AppError(404, "TEAM_NOT_FOUND", "The team was not found.");

  return {
    id: team.id,
    name: team.name,
    description: team.description,
    memberCount: team.members.length,
    createdAt: team.createdAt.toISOString(),
    members: team.members.map((m) => ({
      id: m.membership.id,
      name: m.membership.user.name,
      email: m.membership.user.email,
      role: m.membership.membershipRoles.map((mr) => mr.role.name).join(", ") || "Member"
    }))
  };
}

export async function createTeam(organizationId: string, actorId: string, input: CreateTeamDto): Promise<TeamDto> {
  const existing = await prisma.team.findUnique({ where: { tenantId_name: { tenantId: organizationId, name: input.name } } });
  if (existing) throw new AppError(409, "TEAM_ALREADY_EXISTS", "A team with this name already exists.");

  const team = await prisma.team.create({ data: { tenantId: organizationId, name: input.name, description: input.description } });
  await prisma.auditLog.create({
    data: { tenantId: organizationId, actorId, action: "team.created", resourceType: "Team", resourceId: team.id, contextJson: JSON.stringify({ name: input.name }) }
  });
  return { id: team.id, name: team.name, description: team.description, memberCount: 0, createdAt: team.createdAt.toISOString() };
}

export async function updateTeam(organizationId: string, actorId: string, teamId: string, input: UpdateTeamDto): Promise<TeamDto> {
  const team = await prisma.team.findFirst({ where: { id: teamId, tenantId: organizationId } });
  if (!team) throw new AppError(404, "TEAM_NOT_FOUND", "The team was not found.");

  if (input.name && input.name !== team.name) {
    const existing = await prisma.team.findUnique({ where: { tenantId_name: { tenantId: organizationId, name: input.name } } });
    if (existing) throw new AppError(409, "TEAM_ALREADY_EXISTS", "A team with this name already exists.");
  }

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: { name: input.name, description: input.description },
    include: { _count: { select: { members: true } } }
  });
  await prisma.auditLog.create({
    data: { tenantId: organizationId, actorId, action: "team.updated", resourceType: "Team", resourceId: teamId, contextJson: JSON.stringify(input) }
  });
  return { id: updated.id, name: updated.name, description: updated.description, memberCount: updated._count.members, createdAt: updated.createdAt.toISOString() };
}

export async function deleteTeam(organizationId: string, actorId: string, teamId: string): Promise<void> {
  const team = await prisma.team.findFirst({ where: { id: teamId, tenantId: organizationId } });
  if (!team) throw new AppError(404, "TEAM_NOT_FOUND", "The team was not found.");
  await prisma.team.delete({ where: { id: teamId } });
  await prisma.auditLog.create({
    data: { tenantId: organizationId, actorId, action: "team.deleted", resourceType: "Team", resourceId: teamId }
  });
}

export async function addTeamMember(organizationId: string, actorId: string, teamId: string, membershipId: string): Promise<void> {
  const team = await prisma.team.findFirst({ where: { id: teamId, tenantId: organizationId } });
  if (!team) throw new AppError(404, "TEAM_NOT_FOUND", "The team was not found.");
  const membership = await prisma.organizationMember.findFirst({ where: { id: membershipId, tenantId: organizationId, status: "ACTIVE" } });
  if (!membership) throw new AppError(404, "MEMBERSHIP_NOT_FOUND", "The member was not found.");

  await prisma.teamMember.upsert({
    where: { teamId_membershipId: { teamId, membershipId } },
    create: { tenantId: organizationId, teamId, membershipId },
    update: {}
  });
  await prisma.auditLog.create({
    data: { tenantId: organizationId, actorId, action: "team.member.added", resourceType: "Team", resourceId: teamId, contextJson: JSON.stringify({ membershipId }) }
  });
}

export async function removeTeamMember(organizationId: string, actorId: string, teamId: string, membershipId: string): Promise<void> {
  const team = await prisma.team.findFirst({ where: { id: teamId, tenantId: organizationId } });
  if (!team) throw new AppError(404, "TEAM_NOT_FOUND", "The team was not found.");

  await prisma.teamMember.deleteMany({ where: { teamId, membershipId } });
  await prisma.auditLog.create({
    data: { tenantId: organizationId, actorId, action: "team.member.removed", resourceType: "Team", resourceId: teamId, contextJson: JSON.stringify({ membershipId }) }
  });
}
