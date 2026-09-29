-- Seed new permissions: approvals.view, approvals.manage, notifications.view
INSERT OR IGNORE INTO "Permission" ("id", "key", "description") VALUES
  (lower(hex(randomblob(12))), 'approvals.view', 'approvals.view'),
  (lower(hex(randomblob(12))), 'approvals.manage', 'approvals.manage'),
  (lower(hex(randomblob(12))), 'notifications.view', 'notifications.view');

-- Grant approvals.view + notifications.view to all system roles
-- Grant approvals.manage to Member, Editor, Manager, Admin, Super Admin
INSERT OR IGNORE INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId")
SELECT lower(hex(randomblob(12))), role."tenantId", role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
WHERE role."isSystem" = 1
  AND (
    (permission."key" IN ('approvals.view', 'notifications.view') AND role."name" IN ('Viewer', 'Member', 'Editor', 'Manager', 'Admin', 'Super Admin'))
    OR
    (permission."key" = 'approvals.manage' AND role."name" IN ('Member', 'Editor', 'Manager', 'Admin', 'Super Admin'))
  );
