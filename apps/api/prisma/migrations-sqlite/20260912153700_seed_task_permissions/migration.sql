INSERT OR IGNORE INTO "Permission" ("id", "key", "description") VALUES
  (lower(hex(randomblob(12))), 'tasks.view', 'tasks.view'),
  (lower(hex(randomblob(12))), 'tasks.manage', 'tasks.manage');

INSERT OR IGNORE INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId")
SELECT lower(hex(randomblob(12))), role."tenantId", role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
WHERE
  role."name" IN ('Super Admin', 'Admin', 'Manager', 'Editor', 'Member')
  OR (role."name" = 'Viewer' AND permission."key" = 'tasks.view');
