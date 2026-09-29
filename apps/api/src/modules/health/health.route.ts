import type { FastifyPluginAsync } from "fastify";
import type { HealthCheckDetail } from "@nexora/contracts";
import { prisma } from "../../lib/prisma.js";
import { storage } from "../../services/storage/index.js";
import { getEmailService } from "../../services/mail/mail.service.js";

interface HealthStatus {
  service: string;
  status: "operational" | "degraded" | "down";
  version: string;
  timestamp: string;
  uptime: number;
  checks: HealthCheckDetail[];
}

async function checkDatabase(): Promise<HealthCheckDetail> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: "database", status: "operational", latencyMs: Date.now() - start };
  } catch (error) {
    return { name: "database", status: "down", latencyMs: Date.now() - start, message: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function checkStorage(): Promise<HealthCheckDetail> {
  const start = Date.now();
  try {
    // Try a simple exists check on a non-existent key
    await storage.exists("__health_check__");
    return { name: "storage", status: "operational", latencyMs: Date.now() - start };
  } catch (error) {
    return { name: "storage", status: "degraded", latencyMs: Date.now() - start, message: error instanceof Error ? error.message : "Unknown error" };
  }
}

function checkEmail(): HealthCheckDetail {
  return { name: "email", status: getEmailService().available ? "operational" : "operational", message: getEmailService().available ? undefined : "Email service not configured (optional)" };
}

function checkMemory(): HealthCheckDetail {
  const mem = process.memoryUsage();
  const heapUsedMb = Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100;
  const heapTotalMb = Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100;
  const status = heapUsedMb > heapTotalMb * 0.9 ? "degraded" : "operational";
  return { name: "memory", status, message: `Heap: ${heapUsedMb}MB / ${heapTotalMb}MB` };
}

export const healthRoute: FastifyPluginAsync = async (app) => {
  // Liveness probe — simple "is the process running?"
  app.get("/health/live", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // Readiness probe — are all dependencies ready?
  app.get("/health/ready", async (_request, reply) => {
    const checks = await Promise.all([checkDatabase(), checkStorage()]);
    checks.push(checkEmail());
    checks.push(checkMemory());

    const allOperational = checks.every((c) => c.status === "operational");
    const anyDown = checks.some((c) => c.status === "down");

    const status: HealthStatus = {
      service: "nexora-api",
      status: anyDown ? "down" : allOperational ? "operational" : "degraded",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      checks
    };

    return reply.status(anyDown ? 503 : 200).send(status);
  });

  // Full health check (backward-compatible with existing /health)
  app.get("/health", async (_request, reply) => {
    const checks = await Promise.all([checkDatabase(), checkStorage()]);
    checks.push(checkEmail());
    checks.push(checkMemory());

    const anyDown = checks.some((c) => c.status === "down");
    const allOperational = checks.every((c) => c.status === "operational");

    const status: HealthStatus = {
      service: "nexora-api",
      status: anyDown ? "down" : allOperational ? "operational" : "degraded",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      checks
    };

    return reply.status(anyDown ? 503 : 200).send(status);
  });

  // Metrics endpoint (Prometheus-style text format)
  app.get("/metrics", async (_request, reply) => {
    const mem = process.memoryUsage();
    const checks = await Promise.all([checkDatabase(), checkStorage()]);

    const lines: string[] = [
      "# HELP nexora_uptime_seconds Process uptime in seconds",
      "# TYPE nexora_uptime_seconds gauge",
      `nexora_uptime_seconds ${Math.round(process.uptime())}`,
      "",
      "# HELP nexora_heap_used_bytes Process heap used in bytes",
      "# TYPE nexora_heap_used_bytes gauge",
      `nexora_heap_used_bytes ${mem.heapUsed}`,
      "",
      "# HELP nexora_heap_total_bytes Process heap total in bytes",
      "# TYPE nexora_heap_total_bytes gauge",
      `nexora_heap_total_bytes ${mem.heapTotal}`,
      "",
      "# HELP nexora_database_up Database connectivity (1=up, 0=down)",
      "# TYPE nexora_database_up gauge",
      `nexora_database_up ${checks[0].status === "operational" ? 1 : 0}`,
      "",
      "# HELP nexora_storage_up Storage connectivity (1=up, 0=down)",
      "# TYPE nexora_storage_up gauge",
      `nexora_storage_up ${checks[1].status === "operational" ? 1 : 0}`,
      ""
    ];

    return reply.type("text/plain").send(lines.join("\n"));
  });
};
