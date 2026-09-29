import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { Prisma } from "@prisma/client";
import Fastify from "fastify";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { authRoute } from "./modules/auth/auth.route.js";
import { ssoRoute } from "./modules/auth/sso.route.js";
import { dashboardRoute } from "./modules/dashboards/dashboard.route.js";
import { documentRoute } from "./modules/documents/document.route.js";
import { formRoute } from "./modules/forms/form.route.js";
import { healthRoute } from "./modules/health/health.route.js";
import { listRoute } from "./modules/lists/list.route.js";
import { organizationRoute } from "./modules/organizations/organization.route.js";
import { roleRoute } from "./modules/permissions/role.route.js";
import { taskRoute } from "./modules/tasks/task.route.js";
import { userRoute } from "./modules/users/user.route.js";
import { workflowRoute } from "./modules/workflows/workflow.route.js";
import { approvalRoute } from "./modules/approvals/approval.route.js";
import { notificationRoute } from "./modules/notifications/notification.route.js";
import { searchRoute } from "./modules/search/search.route.js";
import { auditRoute } from "./modules/audit/audit.route.js";
import { settingsRoute } from "./modules/settings/settings.route.js";
import { teamRoute } from "./modules/teams/team.route.js";
import { aiRoute } from "./modules/ai/ai.route.js";
import { billingRoute } from "./modules/billing/plan.route.js";
import { subscriptionRoute } from "./modules/subscriptions/subscription.route.js";
import { viewRoute } from "./modules/views/view.route.js";
import { webhookRoute } from "./modules/webhooks/webhook.route.js";
import { announcementRoute } from "./modules/announcements/announcement.route.js";
import { governanceRoute } from "./modules/governance/governance.route.js";
import { siteRoute } from "./modules/sites/site.route.js";
import { newsRoute } from "./modules/news/news.route.js";
import { publicRoute } from "./modules/public/public.route.js";
import { collaborationRoute } from "./modules/collaboration/collaboration.route.js";
import { securityRoute } from "./modules/security/security.route.js";

export function buildApp() {
  const allowedOrigins = new Set([env.WEB_ORIGIN]);
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
    allowedOrigins.add("http://localhost:5173");
    allowedOrigins.add("http://127.0.0.1:5173");
  }

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "development" ? "info" : "warn"
    },
    bodyLimit: env.DOCUMENT_MAX_SIZE_BYTES + 1_048_576
  });

  app.decorateRequest("auth", null);
  app.register(cookie);
  app.register(multipart, { limits: { fileSize: env.DOCUMENT_MAX_SIZE_BYTES, files: 1, fields: 10 } });
  app.register(rateLimit, { global: true, max: 100, timeWindow: "1 minute" });
  app.register(cors, {
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });

  // Security headers — the API serves JSON/files only, so a strict static set suffices.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (env.NODE_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  });

  app.register(healthRoute, { prefix: "/api/v1" });
  app.register(authRoute, { prefix: "/api/v1/auth" });
  app.register(ssoRoute, { prefix: "/api/v1" });
  app.register(dashboardRoute, { prefix: "/api/v1" });
  app.register(documentRoute, { prefix: "/api/v1" });
  app.register(formRoute, { prefix: "/api/v1" });
  app.register(listRoute, { prefix: "/api/v1" });
  app.register(taskRoute, { prefix: "/api/v1" });
  app.register(workflowRoute, { prefix: "/api/v1" });
  app.register(approvalRoute, { prefix: "/api/v1" });
  app.register(notificationRoute, { prefix: "/api/v1" });
  app.register(searchRoute, { prefix: "/api/v1" });
  app.register(auditRoute, { prefix: "/api/v1" });
  app.register(settingsRoute, { prefix: "/api/v1" });
  app.register(teamRoute, { prefix: "/api/v1" });
  app.register(aiRoute, { prefix: "/api/v1" });
  app.register(billingRoute, { prefix: "/api/v1" });
  app.register(subscriptionRoute, { prefix: "/api/v1" });
  app.register(viewRoute, { prefix: "/api/v1" });
  app.register(webhookRoute, { prefix: "/api/v1" });
  app.register(announcementRoute, { prefix: "/api/v1" });
  app.register(governanceRoute, { prefix: "/api/v1" });
  app.register(siteRoute, { prefix: "/api/v1" });
  app.register(newsRoute, { prefix: "/api/v1" });
  app.register(publicRoute, { prefix: "/api/v1" });
  app.register(collaborationRoute, { prefix: "/api/v1" });
  app.register(securityRoute, { prefix: "/api/v1" });
  app.register(organizationRoute, { prefix: "/api/v1/organizations" });
  app.register(userRoute, { prefix: "/api/v1" });
  app.register(roleRoute, { prefix: "/api/v1" });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: "NOT_FOUND", message: "The requested endpoint was not found." } });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "The request data is invalid.",
          fields: error.flatten().fieldErrors
        }
      });
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message }
      });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return reply.status(409).send({
        error: { code: "RESOURCE_ALREADY_EXISTS", message: "A resource with these values already exists." }
      });
    }
    if (typeof error === "object" && error && "statusCode" in error && error.statusCode === 413) {
      return reply.status(413).send({
        error: { code: "FILE_TOO_LARGE", message: "The file exceeds the maximum allowed size." }
      });
    }
    if (typeof error === "object" && error && "statusCode" in error && error.statusCode === 429) {
      return reply.status(429).send({
        error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Try again later." }
      });
    }
    // Framework-level client errors (malformed JSON, unsupported media type,
    // oversized params, …) must map to their 4xx status instead of falling
    // through to a 500. The framework message is safe but we return a
    // sanitized, consistent shape.
    if (typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
      const code = "code" in error && typeof error.code === "string" && error.code.startsWith("FST_ERR") ? "BAD_REQUEST" : "REQUEST_ERROR";
      return reply.status(error.statusCode).send({
        error: { code, message: "The request could not be processed." }
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred."
      }
    });
  });

  return app;
}
