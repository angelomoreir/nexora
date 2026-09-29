-- Saved views, subscriptions/alerts, document & folder templates, dashboards.manage permission

-- AlterTable: Document / Folder templates
ALTER TABLE "Document" ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Folder" ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: SavedView
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "createdByMembershipId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "name" TEXT NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SavedView_tenantId_resourceType_resourceId_idx" ON "SavedView"("tenantId", "resourceType", "resourceId");
CREATE INDEX "SavedView_tenantId_createdByMembershipId_idx" ON "SavedView"("tenantId", "createdByMembershipId");

-- CreateTable: Subscription
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "eventsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Subscription_tenantId_membershipId_targetType_targetId_key" ON "Subscription"("tenantId", "membershipId", "targetType", "targetId");
CREATE INDEX "Subscription_tenantId_targetType_targetId_idx" ON "Subscription"("tenantId", "targetType", "targetId");

-- Seed dashboards.manage permission
INSERT OR IGNORE INTO "Permission" ("id", "key", "description") VALUES
  (lower(hex(randomblob(12))), 'dashboards.manage', 'dashboards.manage');

INSERT OR IGNORE INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId")
SELECT lower(hex(randomblob(12))), role."tenantId", role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
WHERE
  role."name" IN ('Super Admin', 'Admin', 'Manager', 'Editor')
  AND permission."key" = 'dashboards.manage';
