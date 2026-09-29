import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { purgeExpiredTrash } from "./modules/documents/document.service.js";

const app = buildApp();

purgeExpiredTrash().catch((error) => app.log.error(error));
const trashPurgeTimer = setInterval(() => purgeExpiredTrash().catch((error) => app.log.error(error)), 6 * 60 * 60 * 1000);
trashPurgeTimer.unref();

async function shutdown(signal: string) {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}
