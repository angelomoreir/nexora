import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { authenticate } from "../auth/auth.guard.js";
import { permissions } from "../permissions/permissions.js";
import { requirePermission } from "../permissions/rbac.guard.js";
import { getSettings, updateSettings } from "./settings.service.js";

const updateSettingsSchema = z.object({
  logoUrl: z.string().url().nullable().optional(),
  language: z.string().min(2).max(10).optional(),
  timezone: z.string().min(2).max(50).optional(),
  passwordMinLength: z.number().int().min(4).max(128).optional(),
  passwordRequireUpper: z.boolean().optional(),
  passwordRequireLower: z.boolean().optional(),
  passwordRequireDigit: z.boolean().optional(),
  passwordRequireSymbol: z.boolean().optional(),
  storageQuotaBytes: z.number().int().min(0).optional(),
  notificationsEnabled: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  trashRetentionDays: z.number().int().min(1).max(3650).optional()
});

async function buildActor(organizationId: string, userId: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: { tenantId: organizationId, userId, status: "ACTIVE", tenant: { status: "ACTIVE" } }
  });
  if (!membership) throw new AppError(403, "FORBIDDEN", "You cannot access this organization.");
  return membership.id;
}

export const settingsRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/organizations/:organizationId/settings",
    { preHandler: [authenticate, requirePermission(permissions.settingsManage)] },
    async (request) => {
      const { organizationId } = request.params as { organizationId: string };
      return getSettings(organizationId);
    }
  );

  app.patch(
    "/organizations/:organizationId/settings",
    { preHandler: [authenticate, requirePermission(permissions.settingsManage)] },
    async (request) => {
      const { organizationId } = request.params as { organizationId: string };
      const input = updateSettingsSchema.parse(request.body);
      const actorId = await buildActor(organizationId, request.auth!.userId);
      return updateSettings(organizationId, actorId, input);
    }
  );
};
