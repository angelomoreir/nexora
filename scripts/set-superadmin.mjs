// Promotes (or creates+promotes) a platform superadmin.
// Usage (run from repo root):
//   node scripts/set-superadmin.mjs <email> <password> [name] [organizationName]
// If the user does not exist, it is created via /auth/register (which also
// creates their own organization) and then flagged as superadmin.
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");
const argon2 = require("argon2");

const [email, password, name = "Platform Admin", organizationName = "NEXORA"] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: node scripts/set-superadmin.mjs <email> <password> [name] [organizationName]");
  process.exit(1);
}
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

const prisma = new PrismaClient();
const normalized = email.trim().toLowerCase();

try {
  let user = await prisma.user.findUnique({ where: { email: normalized } });

  if (!user) {
    const res = await fetch("http://localhost:3000/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email: normalized, password, organizationName })
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`register failed: ${res.status} ${body}`);
    }
    user = await prisma.user.findUnique({ where: { email: normalized } });
    console.log(`created ${normalized} with organization "${organizationName}"`);
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.user.update({
    where: { id: user.id },
    data: { isSuperAdmin: true, status: "ACTIVE", passwordHash }
  });
  console.log(`${normalized} is now a superadmin.`);
} finally {
  await prisma.$disconnect();
}
