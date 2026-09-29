-- Access management (inheritance flag + access requests), pinning, retention/sensitivity
-- governance, external webhooks, AI auto-metadata markers, webhooks.manage permission

-- AlterTable: Folder
ALTER TABLE "Folder" ADD COLUMN "pinnedAt" DATETIME;
ALTER TABLE "Folder" ADD COLUMN "inheritsPermissions" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Folder" ADD COLUMN "retentionMode" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Folder" ADD COLUMN "retentionDays" INTEGER;
ALTER TABLE "Folder" ADD COLUMN "sensitivity" TEXT NOT NULL DEFAULT 'INTERNAL';

-- AlterTable: Document
ALTER TABLE "Document" ADD COLUMN "pinnedAt" DATETIME;
ALTER TABLE "Document" ADD COLUMN "inheritsPermissions" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Document" ADD COLUMN "metadataAutoJson" TEXT;

-- CreateTable: AccessRequest
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "requesterMembershipId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedByMembershipId" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AccessRequest_tenantId_status_idx" ON "AccessRequest"("tenantId", "status");
CREATE INDEX "AccessRequest_tenantId_resourceType_resourceId_idx" ON "AccessRequest"("tenantId", "resourceType", "resourceId");
CREATE INDEX "AccessRequest_tenantId_requesterMembershipId_idx" ON "AccessRequest"("tenantId", "requesterMembershipId");

-- CreateTable: Webhook
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "eventsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdByMembershipId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Webhook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Webhook_tenantId_status_idx" ON "Webhook"("tenantId", "status");

-- CreateTable: WebhookDelivery
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseCode" INTEGER,
    "error" TEXT,
    "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WebhookDelivery_tenantId_webhookId_attemptedAt_idx" ON "WebhookDelivery"("tenantId", "webhookId", "attemptedAt");

-- Seed webhooks.manage permission
INSERT OR IGNORE INTO "Permission" ("id", "key", "description") VALUES
  (lower(hex(randomblob(12))), 'webhooks.manage', 'webhooks.manage');

INSERT OR IGNORE INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId")
SELECT lower(hex(randomblob(12))), role."tenantId", role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
WHERE
  role."name" IN ('Super Admin', 'Admin', 'Manager', 'Editor')
  AND permission."key" = 'webhooks.manage';
