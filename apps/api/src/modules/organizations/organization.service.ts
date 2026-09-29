import type { RoleName } from "@nexora/contracts";
import type { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { permissions, type PermissionKey } from "../permissions/permissions.js";

const allPermissions = Object.values(permissions);

export const rolePermissions: Record<RoleName, PermissionKey[]> = {
  "Super Admin": allPermissions,
  Admin: allPermissions,
  Manager: [permissions.usersRead, permissions.usersCreate, permissions.usersUpdate, permissions.documentsView, permissions.documentsEdit, permissions.documentsDelete, permissions.documentsShare, permissions.listsView, permissions.listsManage, permissions.formsView, permissions.formsManage, permissions.tasksView, permissions.tasksManage, permissions.workflowsView, permissions.workflowsManage, permissions.approvalsView, permissions.approvalsManage, permissions.notificationsView, permissions.dashboardsManage, permissions.analyticsView, permissions.auditView, permissions.settingsManage, permissions.webhooksManage, permissions.sitesView, permissions.sitesManage, permissions.pagesView, permissions.pagesManage, permissions.newsView, permissions.newsManage],
  Editor: [permissions.usersRead, permissions.usersUpdate, permissions.documentsView, permissions.documentsEdit, permissions.documentsDelete, permissions.listsView, permissions.listsManage, permissions.formsView, permissions.formsManage, permissions.tasksView, permissions.tasksManage, permissions.workflowsView, permissions.workflowsManage, permissions.approvalsView, permissions.approvalsManage, permissions.notificationsView, permissions.dashboardsManage, permissions.webhooksManage, permissions.sitesView, permissions.pagesView, permissions.pagesManage, permissions.newsView, permissions.newsManage],
  Member: [permissions.usersRead, permissions.documentsView, permissions.documentsEdit, permissions.listsView, permissions.formsView, permissions.tasksView, permissions.tasksManage, permissions.workflowsView, permissions.approvalsView, permissions.approvalsManage, permissions.notificationsView, permissions.sitesView, permissions.pagesView, permissions.newsView],
  Viewer: [permissions.usersRead, permissions.documentsView, permissions.listsView, permissions.formsView, permissions.tasksView, permissions.workflowsView, permissions.approvalsView, permissions.notificationsView, permissions.sitesView, permissions.pagesView, permissions.newsView]
};

export async function createOrganizationForUser(
  transaction: Prisma.TransactionClient,
  userId: string,
  name: string
) {
  const slugBase = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "organization";
  const slug = `${slugBase}-${randomBytes(4).toString("hex")}`;

  const organization = await transaction.organization.create({ data: { name, slug } });
  const existingPermissions = await transaction.permission.findMany({
    where: { key: { in: allPermissions } },
    select: { key: true }
  });
  const existingPermissionKeys = new Set(existingPermissions.map(({ key }) => key));
  const missingPermissionKeys = allPermissions.filter((key) => !existingPermissionKeys.has(key));
  if (missingPermissionKeys.length > 0) {
    await transaction.permission.createMany({
      data: missingPermissionKeys.map((key) => ({ key, description: key }))
    });
  }
  const permissionRecords = await transaction.permission.findMany({
    where: { key: { in: allPermissions } },
    select: { id: true, key: true }
  });
  const permissionIds = new Map(permissionRecords.map((permission) => [permission.key, permission.id]));

  await transaction.role.createMany({
    data: Object.keys(rolePermissions).map((roleName) => ({
      tenantId: organization.id,
      name: roleName,
      isSystem: true
    }))
  });
  const roles = await transaction.role.findMany({
    where: { tenantId: organization.id },
    select: { id: true, name: true }
  });
  const roleIds = new Map(roles.map((role) => [role.name, role.id]));

  await transaction.rolePermission.createMany({
    data: (Object.entries(rolePermissions) as Array<[RoleName, PermissionKey[]]>).flatMap(
      ([roleName, rolePermissionKeys]) =>
        rolePermissionKeys.map((key) => ({
          tenantId: organization.id,
          roleId: roleIds.get(roleName)!,
          permissionId: permissionIds.get(key)!
        }))
    )
  });

  const membership = await transaction.organizationMember.create({
    data: { tenantId: organization.id, userId }
  });
  await transaction.organizationMemberRole.create({
    data: {
      tenantId: organization.id,
      membershipId: membership.id,
      roleId: roleIds.get("Admin")!
    }
  });
  const documentsFolder = await transaction.folder.create({
    data: { tenantId: organization.id, name: "Documentos", createdById: userId }
  });
  await transaction.folder.createMany({
    data: ["Contratos", "Faturas", "Projetos"].map((folderName) => ({
      tenantId: organization.id,
      parentId: documentsFolder.id,
      name: folderName,
      createdById: userId
    }))
  });
  await transaction.auditLog.create({
    data: {
      tenantId: organization.id,
      actorId: membership.id,
      action: "organization.created",
      resourceType: "Organization",
      resourceId: organization.id
    }
  });

  // Assign Free plan to new organizations
  const freePlan = await transaction.plan.findUnique({ where: { code: "free" } });
  if (freePlan) {
    await transaction.organizationSubscription.create({
      data: { tenantId: organization.id, planId: freePlan.id, status: "ACTIVE", billingCycle: "MONTHLY" }
    });
  }

  return organization;
}
