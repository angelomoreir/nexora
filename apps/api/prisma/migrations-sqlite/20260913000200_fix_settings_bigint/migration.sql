-- Recreate OrganizationSettings with BIGINT for storageQuotaBytes
-- The 2 existing records are auto-created defaults and will be recreated on demand.
DROP TABLE IF EXISTS "OrganizationSettings";

CREATE TABLE "OrganizationSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "language" TEXT NOT NULL DEFAULT 'pt-PT',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Lisbon',
    "passwordMinLength" INTEGER NOT NULL DEFAULT 8,
    "passwordRequireUpper" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireLower" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireDigit" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireSymbol" BOOLEAN NOT NULL DEFAULT false,
    "storageQuotaBytes" BIGINT NOT NULL DEFAULT 10737418240,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "OrganizationSettings_tenantId_idx" ON "OrganizationSettings"("tenantId");
CREATE UNIQUE INDEX "OrganizationSettings_tenantId_key" ON "OrganizationSettings"("tenantId");
