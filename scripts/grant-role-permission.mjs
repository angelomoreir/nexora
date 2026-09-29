// Grants a permission to a named role in every organization.
// Usage: node scripts/grant-role-permission.mjs <roleName> <permissionKey>
// Example: node scripts/grant-role-permission.mjs "Editor" "sites.manage"
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
require("dotenv").config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
const { PrismaClient } = require("@prisma/client");

const [roleName, permissionKey] = process.argv.slice(2);
if (!roleName || !permissionKey) {
  console.error('Usage: node scripts/grant-role-permission.mjs <roleName> <permissionKey>');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const permission = await prisma.permission.findUnique({ where: { key: permissionKey } });
  if (!permission) {
    console.error(`Permission "${permissionKey}" not found.`);
    process.exit(1);
  }

  const roles = await prisma.role.findMany({ where: { name: roleName }, select: { id: true, tenantId: true } });
  let granted = 0;
  for (const role of roles) {
    const existing = await prisma.rolePermission.findFirst({
      where: { roleId: role.id, permissionId: permission.id }
    });
    if (existing) continue;
    await prisma.rolePermission.create({
      data: { tenantId: role.tenantId, roleId: role.id, permissionId: permission.id }
    });
    granted++;
  }
  console.log(`Granted "${permissionKey}" to role "${roleName}" in ${granted} organization(s) (${roles.length - granted} already had it).`);
} finally {
  await prisma.$disconnect();
}
