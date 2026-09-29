import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";

const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().max(500).optional(),
  permissionKeys: z.array(z.string().min(1)).default([])
});

const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().max(500).nullable().optional(),
  permissionKeys: z.array(z.string().min(1)).optional()
});

async function buildActor(organizationId: string, userId: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: { tenantId: organizationId, userId, status: "ACTIVE", tenant: { status: "ACTIVE" } }
  });
  if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");
  return membership.id;
}

export const roleRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/organizations/:organizationId/roles",
    { preHandler: [authenticate, requirePermission(permissions.usersRead)] },
    async (request) => {
      const { organizationId } = request.params as { organizationId: string };
      const roles = await prisma.role.findMany({
        where: { tenantId: organizationId },
        include: { permissions: { include: { permission: true } } },
        orderBy: { name: "asc" }
      });
      return roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        permissions: r.permissions.map((rp) => ({ id: rp.permission.id, key: rp.permission.key, description: rp.permission.description }))
      }));
    }
  );

  app.get(
    "/organizations/:organizationId/permissions",
    { preHandler: [authenticate, requirePermission(permissions.usersRead)] },
    async () => {
      const allPerms = await prisma.permission.findMany({ orderBy: { key: "asc" } });
      return allPerms.map((p) => ({ id: p.id, key: p.key, description: p.description }));
    }
  );

  app.post(
    "/organizations/:organizationId/roles",
    { preHandler: [authenticate, requirePermission(permissions.rolesManage)] },
    async (request, reply) => {
      const { organizationId } = request.params as { organizationId: string };
      const input = createRoleSchema.parse(request.body);
      const actorId = await buildActor(organizationId, request.auth!.userId);

      const existing = await prisma.role.findUnique({ where: { tenantId_name: { tenantId: organizationId, name: input.name } } });
      if (existing) throw new AppError(409, "ROLE_ALREADY_EXISTS", "A role with this name already exists.");

      const permRecords = input.permissionKeys.length > 0 ? await prisma.permission.findMany({ where: { key: { in: input.permissionKeys } } }) : [];
      const role = await prisma.role.create({
        data: {
          tenantId: organizationId,
          name: input.name,
          description: input.description,
          isSystem: false,
          permissions: { create: permRecords.map((p) => ({ tenantId: organizationId, permissionId: p.id })) }
        },
        include: { permissions: { include: { permission: true } } }
      });

      await prisma.auditLog.create({
        data: { tenantId: organizationId, actorId, action: "role.created", resourceType: "Role", resourceId: role.id, contextJson: JSON.stringify({ name: input.name, permissionKeys: input.permissionKeys }) }
      });

      return reply.status(201).send({
        id: role.id,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: role.permissions.map((rp) => ({ id: rp.permission.id, key: rp.permission.key, description: rp.permission.description }))
      });
    }
  );

  app.patch(
    "/organizations/:organizationId/roles/:roleId",
    { preHandler: [authenticate, requirePermission(permissions.rolesManage)] },
    async (request) => {
      const { organizationId, roleId } = request.params as { organizationId: string; roleId: string };
      const input = updateRoleSchema.parse(request.body);
      const actorId = await buildActor(organizationId, request.auth!.userId);

      const role = await prisma.role.findFirst({ where: { id: roleId, tenantId: organizationId } });
      if (!role) throw new AppError(404, "ROLE_NOT_FOUND", "The role was not found.");
      if (role.isSystem) throw new AppError(400, "CANNOT_EDIT_SYSTEM_ROLE", "System roles cannot be edited.");

      if (input.name && input.name !== role.name) {
        const existing = await prisma.role.findUnique({ where: { tenantId_name: { tenantId: organizationId, name: input.name } } });
        if (existing) throw new AppError(409, "ROLE_ALREADY_EXISTS", "A role with this name already exists.");
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.role.update({
          where: { id: roleId },
          data: { name: input.name, description: input.description }
        });

        if (input.permissionKeys) {
          const permRecords = await tx.permission.findMany({ where: { key: { in: input.permissionKeys } } });
          await tx.rolePermission.deleteMany({ where: { tenantId: organizationId, roleId } });
          await tx.rolePermission.createMany({
            data: permRecords.map((p) => ({ tenantId: organizationId, roleId, permissionId: p.id }))
          });
        }

        return tx.role.findUniqueOrThrow({
          where: { id: roleId },
          include: { permissions: { include: { permission: true } } }
        });
      });

      await prisma.auditLog.create({
        data: { tenantId: organizationId, actorId, action: "role.updated", resourceType: "Role", resourceId: roleId, contextJson: JSON.stringify(input) }
      });

      return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        isSystem: updated.isSystem,
        permissions: updated.permissions.map((rp) => ({ id: rp.permission.id, key: rp.permission.key, description: rp.permission.description }))
      };
    }
  );

  app.delete(
    "/organizations/:organizationId/roles/:roleId",
    { preHandler: [authenticate, requirePermission(permissions.rolesManage)] },
    async (request, reply) => {
      const { organizationId, roleId } = request.params as { organizationId: string; roleId: string };
      const actorId = await buildActor(organizationId, request.auth!.userId);

      const role = await prisma.role.findFirst({ where: { id: roleId, tenantId: organizationId } });
      if (!role) throw new AppError(404, "ROLE_NOT_FOUND", "The role was not found.");
      if (role.isSystem) throw new AppError(400, "CANNOT_DELETE_SYSTEM_ROLE", "System roles cannot be deleted.");

      const memberCount = await prisma.organizationMemberRole.count({ where: { tenantId: organizationId, roleId } });
      if (memberCount > 0) throw new AppError(409, "ROLE_IN_USE", "This role is assigned to members and cannot be deleted.");

      await prisma.role.delete({ where: { id: roleId } });
      await prisma.auditLog.create({
        data: { tenantId: organizationId, actorId, action: "role.deleted", resourceType: "Role", resourceId: roleId }
      });
      return reply.status(204).send();
    }
  );
};
