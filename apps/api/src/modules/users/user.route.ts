import type { RoleName } from "@nexora/contracts";
import type { FastifyPluginAsync } from "fastify";
import { AppError } from "../../lib/errors.js";
import { prisma, transactionOptions } from "../../lib/prisma.js";
import { hashPassword } from "../../lib/security.js";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import { createUserSchema, inviteUserSchema, updateOrganizationUserSchema } from "./user.schemas.js";
import { presentUser } from "./user.presenter.js";
import { createInvitation, listInvitations, revokeInvitation } from "./invitation.service.js";

const memberInclude = {
  user: true,
  membershipRoles: { include: { role: true } }
} as const;

function presentMember(member: Awaited<ReturnType<typeof getMember>>) {
  if (!member) {
    throw new AppError(404, "USER_NOT_FOUND", "The user was not found in this organization.");
  }
  return {
    ...presentUser(member.user),
    memberStatus: member.status,
    memberId: member.id,
    roles: member.membershipRoles.map(({ role }) => role.name as RoleName)
  };
}

function getMember(organizationId: string, userId: string) {
  return prisma.organizationMember.findFirst({
    where: { tenantId: organizationId, userId },
    include: memberInclude
  });
}

export const userRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/organizations/:organizationId/users",
    { preHandler: [authenticate, requirePermission(permissions.usersRead)] },
    async (request) => {
      const { organizationId } = request.params as { organizationId: string };
      const members = await prisma.organizationMember.findMany({
        where: { tenantId: organizationId },
        include: memberInclude,
        orderBy: { createdAt: "asc" }
      });
      return members.map(presentMember);
    }
  );

  app.get(
    "/organizations/:organizationId/users/:userId",
    { preHandler: [authenticate, requirePermission(permissions.usersRead)] },
    async (request) => {
      const { organizationId, userId } = request.params as { organizationId: string; userId: string };
      return presentMember(await getMember(organizationId, userId));
    }
  );

  app.post(
    "/organizations/:organizationId/users",
    { preHandler: [authenticate, requirePermission(permissions.usersCreate)] },
    async (request, reply) => {
      const { organizationId } = request.params as { organizationId: string };
      const input = createUserSchema.parse(request.body);
      if (input.role !== "Member") {
        await requirePermission(permissions.rolesManage)(request, reply);
      }
      if (input.role === "Super Admin" && !request.auth!.isSuperAdmin) {
        throw new AppError(403, "FORBIDDEN", "Only a platform super administrator can assign this role.");
      }
      const email = input.email.toLowerCase();
      const passwordHash = await hashPassword(input.password);

      // Check plan limits before creating user
      const { checkLimit } = await import("../billing/plan.service.js");
      await checkLimit(organizationId, "users");

      const member = await prisma.$transaction(async (transaction) => {
        if (await transaction.user.findUnique({ where: { email } })) {
          throw new AppError(409, "EMAIL_ALREADY_EXISTS", "An account with this email already exists.");
        }
        const role = await transaction.role.findUnique({
          where: { tenantId_name: { tenantId: organizationId, name: input.role } }
        });
        if (!role) {
          throw new AppError(404, "ORGANIZATION_NOT_FOUND", "The organization was not found.");
        }
        const actor = await transaction.organizationMember.findUniqueOrThrow({
          where: { tenantId_userId: { tenantId: organizationId, userId: request.auth!.userId } }
        });
        const user = await transaction.user.create({
          data: {
            name: input.name,
            email,
            passwordHash,
            avatar: input.avatar,
            jobTitle: input.jobTitle
          }
        });
        const membership = await transaction.organizationMember.create({
          data: { tenantId: organizationId, userId: user.id }
        });
        await transaction.organizationMemberRole.create({
          data: { tenantId: organizationId, membershipId: membership.id, roleId: role.id }
        });
        await transaction.auditLog.create({
          data: {
            tenantId: organizationId,
            actorId: actor.id,
            action: "user.created",
            resourceType: "User",
            resourceId: user.id
          }
        });
        return transaction.organizationMember.findUniqueOrThrow({
          where: { id: membership.id },
          include: memberInclude
        });
      }, transactionOptions);

      return reply.status(201).send(presentMember(member));
    }
  );

  app.get(
    "/organizations/:organizationId/invitations",
    { preHandler: [authenticate, requirePermission(permissions.usersRead)] },
    async (request) => {
      const { organizationId } = request.params as { organizationId: string };
      return listInvitations(organizationId);
    }
  );

  app.post(
    "/organizations/:organizationId/invitations",
    { preHandler: [authenticate, requirePermission(permissions.usersCreate)] },
    async (request, reply) => {
      const { organizationId } = request.params as { organizationId: string };
      const input = inviteUserSchema.parse(request.body);
      if (input.role !== "Member") {
        await requirePermission(permissions.rolesManage)(request, reply);
      }
      if (input.role === "Super Admin" && !request.auth!.isSuperAdmin) {
        throw new AppError(403, "FORBIDDEN", "Only a platform super administrator can assign this role.");
      }
      const result = await createInvitation(organizationId, request.auth!.userId, input);
      return reply.status(201).send(result);
    }
  );

  app.delete(
    "/organizations/:organizationId/invitations/:invitationId",
    { preHandler: [authenticate, requirePermission(permissions.usersDelete)] },
    async (request, reply) => {
      const { organizationId, invitationId } = request.params as { organizationId: string; invitationId: string };
      await revokeInvitation(organizationId, invitationId, request.auth!.userId);
      return reply.status(204).send();
    }
  );

  app.patch(
    "/organizations/:organizationId/users/:userId",
    { preHandler: [authenticate, requirePermission(permissions.usersUpdate)] },
    async (request, reply) => {
      const { organizationId, userId } = request.params as { organizationId: string; userId: string };
      const input = updateOrganizationUserSchema.parse(request.body);
      if (input.role) {
        await requirePermission(permissions.rolesManage)(request, reply);
      }
      if (input.role === "Super Admin" && !request.auth!.isSuperAdmin) {
        throw new AppError(403, "FORBIDDEN", "Only a platform super administrator can assign this role.");
      }
      const existing = await getMember(organizationId, userId);
      if (!existing) {
        throw new AppError(404, "USER_NOT_FOUND", "The user was not found in this organization.");
      }
      const { memberStatus, role, status, ...profile } = input;
      const canUpdateProfile = request.auth!.isSuperAdmin || request.auth!.userId === userId;
      if (!canUpdateProfile && Object.keys(profile).length > 0) {
        throw new AppError(403, "PROFILE_OWNERSHIP_REQUIRED", "Only the user can update global profile fields.");
      }
      if (status && !request.auth!.isSuperAdmin) {
        throw new AppError(403, "SUPER_ADMIN_REQUIRED", "Only a platform super administrator can update user status.");
      }

      await prisma.$transaction(async (transaction) => {
        const actor = await transaction.organizationMember.findUniqueOrThrow({
          where: { tenantId_userId: { tenantId: organizationId, userId: request.auth!.userId } }
        });
        if ((canUpdateProfile && Object.keys(profile).length > 0) || status) {
          await transaction.user.update({ where: { id: userId }, data: { ...profile, status } });
        }
        if (memberStatus) {
          await transaction.organizationMember.update({ where: { id: existing.id }, data: { status: memberStatus } });
        }
        if (role) {
          const selectedRole = await transaction.role.findUnique({
            where: { tenantId_name: { tenantId: organizationId, name: role } }
          });
          if (!selectedRole) {
            throw new AppError(404, "ROLE_NOT_FOUND", "The role was not found.");
          }
          await transaction.organizationMemberRole.deleteMany({ where: { membershipId: existing.id } });
          await transaction.organizationMemberRole.create({
            data: { tenantId: organizationId, membershipId: existing.id, roleId: selectedRole.id }
          });
        }
        await transaction.auditLog.create({
          data: {
            tenantId: organizationId,
            actorId: actor.id,
            action: "user.updated",
            resourceType: "User",
            resourceId: userId
          }
        });
      }, transactionOptions);

      return presentMember(await getMember(organizationId, userId));
    }
  );

  app.delete(
    "/organizations/:organizationId/users/:userId",
    { preHandler: [authenticate, requirePermission(permissions.usersDelete)] },
    async (request, reply) => {
      const { organizationId, userId } = request.params as { organizationId: string; userId: string };
      if (request.auth!.userId === userId) {
        throw new AppError(400, "CANNOT_REMOVE_SELF", "You cannot remove yourself from the active organization.");
      }
      const member = await getMember(organizationId, userId);
      if (!member) {
        throw new AppError(404, "USER_NOT_FOUND", "The user was not found in this organization.");
      }
      await prisma.$transaction(async (transaction) => {
        const actor = await transaction.organizationMember.findUniqueOrThrow({
          where: { tenantId_userId: { tenantId: organizationId, userId: request.auth!.userId } }
        });
        await transaction.organizationMember.update({
          where: { id: member.id },
          data: { status: "SUSPENDED" }
        });
        await transaction.auditLog.create({
          data: {
            tenantId: organizationId,
            actorId: actor.id,
            action: "user.removed",
            resourceType: "User",
            resourceId: userId
          }
        });
      }, transactionOptions);
      return reply.status(204).send();
    }
  );
};
