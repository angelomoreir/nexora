import type { OrganizationSettingsDto, UpdateOrganizationSettingsDto } from "@nexora/contracts";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

export async function getSettings(organizationId: string): Promise<OrganizationSettingsDto> {
  const settings = await prisma.organizationSettings.findUnique({ where: { tenantId: organizationId } });
  if (!settings) {
    // Auto-create default settings if they don't exist
    const created = await prisma.organizationSettings.create({ data: { tenantId: organizationId } });
    return toDto(created);
  }
  return toDto(settings);
}

export async function updateSettings(organizationId: string, actorId: string, input: UpdateOrganizationSettingsDto): Promise<OrganizationSettingsDto> {
  // Ensure settings exist
  await getSettings(organizationId);

  const data: {
    logoUrl?: string | null;
    language?: string;
    timezone?: string;
    passwordMinLength?: number;
    passwordRequireUpper?: boolean;
    passwordRequireLower?: boolean;
    passwordRequireDigit?: boolean;
    passwordRequireSymbol?: boolean;
    storageQuotaBytes?: bigint;
    notificationsEnabled?: boolean;
    emailNotifications?: boolean;
    trashRetentionDays?: number;
  } = {};

  if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl;
  if (input.language !== undefined) data.language = input.language;
  if (input.timezone !== undefined) data.timezone = input.timezone;
  if (input.passwordMinLength !== undefined) {
    if (input.passwordMinLength < 4 || input.passwordMinLength > 128) throw new AppError(400, "VALIDATION_ERROR", "Password min length must be between 4 and 128.");
    data.passwordMinLength = input.passwordMinLength;
  }
  if (input.passwordRequireUpper !== undefined) data.passwordRequireUpper = input.passwordRequireUpper;
  if (input.passwordRequireLower !== undefined) data.passwordRequireLower = input.passwordRequireLower;
  if (input.passwordRequireDigit !== undefined) data.passwordRequireDigit = input.passwordRequireDigit;
  if (input.passwordRequireSymbol !== undefined) data.passwordRequireSymbol = input.passwordRequireSymbol;
  if (input.storageQuotaBytes !== undefined) {
    if (input.storageQuotaBytes < 0) throw new AppError(400, "VALIDATION_ERROR", "Storage quota must be non-negative.");
    data.storageQuotaBytes = BigInt(input.storageQuotaBytes);
  }
  if (input.notificationsEnabled !== undefined) data.notificationsEnabled = input.notificationsEnabled;
  if (input.emailNotifications !== undefined) data.emailNotifications = input.emailNotifications;
  if (input.trashRetentionDays !== undefined) {
    if (input.trashRetentionDays < 1 || input.trashRetentionDays > 3650) throw new AppError(400, "VALIDATION_ERROR", "Trash retention must be between 1 and 3650 days.");
    data.trashRetentionDays = input.trashRetentionDays;
  }

  const updated = await prisma.organizationSettings.update({ where: { tenantId: organizationId }, data });

  await prisma.auditLog.create({
    data: {
      tenantId: organizationId,
      actorId,
      action: "settings.updated",
      resourceType: "OrganizationSettings",
      resourceId: updated.id,
      contextJson: JSON.stringify(Object.keys(input))
    }
  });

  return toDto(updated);
}

function toDto(s: {
  logoUrl: string | null;
  language: string;
  timezone: string;
  passwordMinLength: number;
  passwordRequireUpper: boolean;
  passwordRequireLower: boolean;
  passwordRequireDigit: boolean;
  passwordRequireSymbol: boolean;
  storageQuotaBytes: bigint;
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  trashRetentionDays: number;
}): OrganizationSettingsDto {
  return {
    logoUrl: s.logoUrl,
    language: s.language,
    timezone: s.timezone,
    passwordPolicy: {
      minLength: s.passwordMinLength,
      requireUpper: s.passwordRequireUpper,
      requireLower: s.passwordRequireLower,
      requireDigit: s.passwordRequireDigit,
      requireSymbol: s.passwordRequireSymbol
    },
    storageQuotaBytes: Number(s.storageQuotaBytes),
    notificationsEnabled: s.notificationsEnabled,
    emailNotifications: s.emailNotifications,
    trashRetentionDays: s.trashRetentionDays
  };
}
