import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { setAuthCookies } from "../../lib/cookies.js";
import { prisma } from "../../lib/prisma.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import { authenticate } from "./auth.guard.js";
import {
  buildSsoAuthorizeUrl,
  deleteSsoConfig,
  getSsoConfig,
  handleSsoCallback,
  lookupSsoByEmail,
  upsertSsoConfig
} from "./sso.service.js";

const ssoConfigSchema = z.object({
  issuerUrl: z.string().url().max(500),
  clientId: z.string().min(1).max(300),
  clientSecret: z.string().max(500).optional(),
  scopes: z.string().min(1).max(300).optional(),
  emailDomains: z.array(z.string().trim().min(3).max(253)).max(50).optional(),
  isEnabled: z.boolean().optional()
});

const lookupSchema = z.object({ email: z.string().trim().email().max(254) });
const ssoRateLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

async function actorMembership(organizationId: string, userId: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: { tenantId: organizationId, userId, status: "ACTIVE" }
  });
  if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");
  return membership.id;
}

export const ssoRoute: FastifyPluginAsync = async (app) => {
  // --- Admin: SSO configuration ---

  app.get(
    "/organizations/:organizationId/sso",
    { preHandler: [authenticate, requirePermission(permissions.settingsManage)] },
    async (request) => {
      const { organizationId } = request.params as { organizationId: string };
      return getSsoConfig(organizationId);
    }
  );

  app.put(
    "/organizations/:organizationId/sso",
    { preHandler: [authenticate, requirePermission(permissions.settingsManage)] },
    async (request) => {
      const { organizationId } = request.params as { organizationId: string };
      const input = ssoConfigSchema.parse(request.body);
      const actorId = await actorMembership(organizationId, request.auth!.userId);
      return upsertSsoConfig(organizationId, actorId, input);
    }
  );

  app.delete(
    "/organizations/:organizationId/sso",
    { preHandler: [authenticate, requirePermission(permissions.settingsManage)] },
    async (request, reply) => {
      const { organizationId } = request.params as { organizationId: string };
      const actorId = await actorMembership(organizationId, request.auth!.userId);
      await deleteSsoConfig(organizationId, actorId);
      return reply.status(204).send();
    }
  );

  // --- Public: login flow ---

  // Lookup whether an email domain has SSO configured
  app.post("/auth/sso/lookup", ssoRateLimit, async (request) => {
    const { email } = lookupSchema.parse(request.body);
    return lookupSsoByEmail(email);
  });

  // Start the OIDC flow — redirects to the identity provider
  app.get("/auth/sso/:organizationId/start", ssoRateLimit, async (request, reply) => {
    const { organizationId } = request.params as { organizationId: string };
    const url = await buildSsoAuthorizeUrl(organizationId);
    return reply.redirect(url);
  });

  // OIDC callback — verifies the response, issues a session, redirects to the app
  app.get("/auth/sso/callback", ssoRateLimit, async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };
    if (!code || !state) {
      return reply.redirect(`${env.APP_URL}/login?sso=error`);
    }
    try {
      const session = await handleSsoCallback(
        { code, state },
        { ipAddress: request.ip, userAgent: request.headers["user-agent"]?.slice(0, 500) }
      );
      setAuthCookies(reply, session.accessToken, session.refreshToken);
      return reply.redirect(`${env.APP_URL}/dashboard`);
    } catch (error) {
      request.log.warn({ err: error }, "SSO callback failed");
      return reply.redirect(`${env.APP_URL}/login?sso=error`);
    }
  });
};
