// Prints organizations and all memberships (user email, org, roles, status).
// Usage: node scripts/check-roles.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
require("dotenv").config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

try {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  console.log("== Organizacoes ==");
  for (const o of orgs) console.log(`${o.name} (${o.id})`);

  const members = await prisma.organizationMember.findMany({
    select: {
      status: true,
      user: { select: { email: true } },
      tenant: { select: { name: true } },
      membershipRoles: { select: { role: { select: { name: true } } } }
    },
    orderBy: { createdAt: "asc" }
  });
  console.log("\n== Membros ==");
  for (const m of members) {
    console.log(`${m.user.email} @ ${m.tenant.name}: ${m.membershipRoles.map((r) => r.role.name).join(", ") || "(sem papel)"} [${m.status}]`);
  }

  const orphans = await prisma.user.findMany({
    where: { memberships: { none: {} } },
    select: { email: true }
  });
  console.log("\n== Utilizadores sem organizacao ==");
  for (const u of orphans) console.log(u.email);
} finally {
  await prisma.$disconnect();
}
