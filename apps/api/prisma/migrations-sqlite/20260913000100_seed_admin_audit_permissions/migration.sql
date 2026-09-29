-- Seed new permissions: audit.view, settings.manage
INSERT OR IGNORE INTO "Permission" ("id", "key", "description") VALUES
  (lower(hex(randomblob(12))), 'audit.view', 'audit.view'),
  (lower(hex(randomblob(12))), 'settings.manage', 'settings.manage');

-- Grant audit.view + settings.manage to Manager, Admin, Super Admin
INSERT OR IGNORE INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId")
SELECT lower(hex(randomblob(12))), role."tenantId", role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
WHERE role."isSystem" = 1
  AND permission."key" IN ('audit.view', 'settings.manage')
  AND role."name" IN ('Manager', 'Admin', 'Super Admin');
