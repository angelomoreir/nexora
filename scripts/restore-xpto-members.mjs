// Re-attaches the seeded @xpto.pt accounts to the "xpto" organization
// (the original "XPTO, Lda." org was deleted during super-admin tests).
// Also verifies that their passwords still match the seed password.
// Usage: node scripts/restore-xpto-members.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
require("dotenv").config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
const { PrismaClient } = require("@prisma/client");
const argon2 = require("argon2");

const SEED_PASSWORD = "XPTOdemo2024!";
const ASSIGNMENTS = [
  ["ana@xpto.pt", "Admin"],
  ["bruno@xpto.pt", "Manager"],
  ["diana@xpto.pt", "Editor"],
  ["carla@xpto.pt", "Member"],
  ["eduardo@xpto.pt", "Viewer"]
];

const prisma = new PrismaClient();

try {
  const org = await prisma.organization.findFirst({ where: { name: "xpto" } });
  if (!org) throw new Error('Organization "xpto" not found.');

  for (const [email, roleName] of ASSIGNMENTS) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`skip    ${email} — user not found`);
      continue;
    }
    const ok = await argon2.verify(user.passwordHash, SEED_PASSWORD).catch(() => false);

    let member = await prisma.organizationMember.findFirst({
      where: { tenantId: org.id, userId: user.id }
    });
    if (!member) {
      member = await prisma.organizationMember.create({
        data: { tenantId: org.id, userId: user.id, status: "ACTIVE" }
      });
    }
    const role = await prisma.role.findUnique({
      where: { tenantId_name: { tenantId: org.id, name: roleName } }
    });
    if (!role) throw new Error(`Role "${roleName}" not found in org ${org.name}`);
    await prisma.organizationMemberRole.deleteMany({ where: { membershipId: member.id } });
    await prisma.organizationMemberRole.create({
      data: { tenantId: org.id, membershipId: member.id, roleId: role.id }
    });
    console.log(`${email} -> ${roleName} @ ${org.name}  (password seed: ${ok ? "OK" : "DIFFERENT"})`);
  }
} finally {
  await prisma.$disconnect();
}
