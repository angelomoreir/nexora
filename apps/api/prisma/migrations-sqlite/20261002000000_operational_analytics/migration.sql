ALTER TABLE "Task" ADD COLUMN "completedAt" DATETIME;

UPDATE "Task"
SET "completedAt" = "updatedAt"
WHERE "status" = 'DONE' AND "completedAt" IS NULL;

CREATE INDEX "Task_tenantId_completedAt_idx" ON "Task"("tenantId", "completedAt");

INSERT OR IGNORE INTO "Permission" ("id", "key", "description")
VALUES (lower(hex(randomblob(12))), 'analytics.view', 'View operational analytics');

INSERT OR IGNORE INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId")
SELECT lower(hex(randomblob(12))), role."tenantId", role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."key" = 'analytics.view'
WHERE role."name" IN ('Manager', 'Admin', 'Super Admin');
