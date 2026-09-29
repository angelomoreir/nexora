import type { SecurityOverviewDto } from "@nexora/contracts";
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";

const LOGIN_ACTIONS = ["auth.login", "auth.sso.login"];
const SECURITY_EVENT_PREFIXES = ["auth.", "sso.", "role.", "settings.", "user."];

const DEFAULT_PASSWORD_POLICY = { minLength: 8, requireUpper: true, requireLower: true, requireDigit: true, requireSymbol: false };

function parseEmailDomains(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

export const securityRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/organizations/:organizationId/security/overview",
    { preHandler: [authenticate, requirePermission(permissions.auditView)] },
    async (request): Promise<SecurityOverviewDto> => {
      const { organizationId } = request.params as { organizationId: string };
      const now = new Date();
      const since = new Date(now.getTime() - 30 * 86_400_000);

      const [ssoConfig, settings, activeMembers, suspendedMembers, pendingInvitations, memberUserIds, failedLogins, logins, settingsChanges, roleChanges, recent] = await Promise.all([
        prisma.ssoConfiguration.findUnique({ where: { tenantId: organizationId } }),
        prisma.organizationSettings.findUnique({ where: { tenantId: organizationId } }),
        prisma.organizationMember.count({ where: { tenantId: organizationId, status: "ACTIVE" } }),
        prisma.organizationMember.count({ where: { tenantId: organizationId, status: "SUSPENDED" } }),
        prisma.invitation.count({ where: { tenantId: organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } }),
        prisma.organizationMember.findMany({ where: { tenantId: organizationId, status: "ACTIVE" }, select: { userId: true } }),
        prisma.auditLog.count({ where: { tenantId: organizationId, occurredAt: { gte: since }, action: { in: LOGIN_ACTIONS }, result: { not: "SUCCESS" } } }),
        prisma.auditLog.count({ where: { tenantId: organizationId, occurredAt: { gte: since }, action: { in: LOGIN_ACTIONS }, result: "SUCCESS" } }),
        prisma.auditLog.count({ where: { tenantId: organizationId, occurredAt: { gte: since }, action: { startsWith: "settings." } } }),
        prisma.auditLog.count({ where: { tenantId: organizationId, occurredAt: { gte: since }, OR: [{ action: { startsWith: "role." } }, { action: "user.updated" }] } }),
        prisma.auditLog.findMany({
          where: { tenantId: organizationId, OR: SECURITY_EVENT_PREFIXES.map((prefix) => ({ action: { startsWith: prefix } })) },
          include: { actor: { include: { user: { select: { name: true } } } } },
          orderBy: { occurredAt: "desc" },
          take: 15
        })
      ]);

      const activeSessions = await prisma.refreshSession.count({
        where: { userId: { in: memberUserIds.map((m) => m.userId) }, revokedAt: null, expiresAt: { gt: now } }
      });

      return {
        sso: {
          enabled: ssoConfig?.isEnabled ?? false,
          issuerUrl: ssoConfig?.issuerUrl ?? null,
          emailDomains: ssoConfig ? parseEmailDomains(ssoConfig.emailDomains) : []
        },
        passwordPolicy: settings
          ? {
              minLength: settings.passwordMinLength,
              requireUpper: settings.passwordRequireUpper,
              requireLower: settings.passwordRequireLower,
              requireDigit: settings.passwordRequireDigit,
              requireSymbol: settings.passwordRequireSymbol
            }
          : DEFAULT_PASSWORD_POLICY,
        members: { active: activeMembers, suspended: suspendedMembers, pendingInvitations },
        sessions: { active: activeSessions },
        securityEvents30d: { failedLogins, logins, settingsChanges, roleChanges },
        recentSecurityEvents: recent.map((log) => ({
          id: log.id,
          action: log.action,
          occurredAt: log.occurredAt.toISOString(),
          actorName: log.actor?.user.name ?? null,
          ipAddress: log.ipAddress,
          result: log.result
        }))
      };
    }
  );
};
