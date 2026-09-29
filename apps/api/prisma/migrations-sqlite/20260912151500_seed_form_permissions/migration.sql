INSERT OR IGNORE INTO "Permission" ("id", "key", "description") VALUES
  (lower(hex(randomblob(12))), 'forms.view', 'forms.view'),
  (lower(hex(randomblob(12))), 'forms.manage', 'forms.manage');

INSERT OR IGNORE INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId")
SELECT lower(hex(randomblob(12))), role."tenantId", role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
WHERE
  role."name" IN ('Super Admin', 'Admin', 'Manager', 'Editor')
  OR (role."name" IN ('Member', 'Viewer') AND permission."key" = 'forms.view');
