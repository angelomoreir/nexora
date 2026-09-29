import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
const require = createRequire(fileURLToPath(new URL("../apps/api/package.json", import.meta.url)));
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const user = await prisma.user.findUnique({
  where: { email: "japmoreira@gmail.com" },
  select: {
    email: true,
    name: true,
    isSuperAdmin: true,
    memberships: { select: { tenant: { select: { name: true, slug: true } }, membershipRoles: { select: { role: { select: { name: true } } } } } }
  }
});
console.log(JSON.stringify(user, null, 2));
await prisma.$disconnect();
