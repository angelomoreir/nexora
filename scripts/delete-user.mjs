// Deletes a user account (and its memberships) by email.
// Usage: node scripts/delete-user.mjs <email>
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
require("dotenv").config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
const { PrismaClient } = require("@prisma/client");

const [email] = process.argv.slice(2);
if (!email) {
  console.error("Usage: node scripts/delete-user.mjs <email>");
  process.exit(1);
}

const prisma = new PrismaClient();
const normalized = email.trim().toLowerCase();

try {
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    console.log(`${normalized} not found.`);
  } else {
    await prisma.user.delete({ where: { id: user.id } });
    console.log(`deleted ${normalized}`);
  }
} finally {
  await prisma.$disconnect();
}
