INSERT OR IGNORE INTO "Permission" ("id", "key", "description") VALUES
  (lower(hex(randomblob(12))), 'lists.view', 'lists.view'),
  (lower(hex(randomblob(12))), 'lists.manage', 'lists.manage');

INSERT OR IGNORE INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId")
SELECT lower(hex(randomblob(12))), role."tenantId", role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
WHERE
  role."name" IN ('Super Admin', 'Admin', 'Manager', 'Editor')
  OR (role."name" = 'Member' AND permission."key" = 'lists.view')
  OR (role."name" = 'Viewer' AND permission."key" = 'lists.view');
