import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
export const transactionOptions = { maxWait: 15_000, timeout: 30_000 } as const;

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
