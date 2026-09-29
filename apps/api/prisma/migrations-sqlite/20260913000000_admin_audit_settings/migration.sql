-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "result" TEXT NOT NULL DEFAULT 'SUCCESS';

-- CreateTable
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
    "storageQuotaBytes" INTEGER NOT NULL DEFAULT 10737418240,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_action_idx" ON "AuditLog"("tenantId", "action");
CREATE INDEX "OrganizationSettings_tenantId_idx" ON "OrganizationSettings"("tenantId");

-- UniqueConstraint
CREATE UNIQUE INDEX "OrganizationSettings_tenantId_key" ON "OrganizationSettings"("tenantId");

-- AddForeignKey
-- SQLite doesn't support ADD CONSTRAINT; foreign key is enforced via table recreation by Prisma client.
-- The relation is defined in schema.prisma and enforced at the ORM level.
