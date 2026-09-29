-- Seed new permissions: sites/pages/news module
INSERT OR IGNORE INTO "Permission" ("id", "key", "description") VALUES
  (lower(hex(randomblob(12))), 'sites.view', 'sites.view'),
  (lower(hex(randomblob(12))), 'sites.manage', 'sites.manage'),
  (lower(hex(randomblob(12))), 'pages.view', 'pages.view'),
  (lower(hex(randomblob(12))), 'pages.manage', 'pages.manage'),
  (lower(hex(randomblob(12))), 'news.view', 'news.view'),
  (lower(hex(randomblob(12))), 'news.manage', 'news.manage');

-- Super Admin, Admin, Manager: all new permissions
INSERT OR IGNORE INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId")
SELECT lower(hex(randomblob(12))), role."tenantId", role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
WHERE role."isSystem" = 1
  AND permission."key" IN ('sites.view', 'sites.manage', 'pages.view', 'pages.manage', 'news.view', 'news.manage')
  AND role."name" IN ('Super Admin', 'Admin', 'Manager');

-- Editor: everything except sites.manage
INSERT OR IGNORE INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId")
SELECT lower(hex(randomblob(12))), role."tenantId", role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
WHERE role."isSystem" = 1
  AND permission."key" IN ('sites.view', 'pages.view', 'pages.manage', 'news.view', 'news.manage')
  AND role."name" = 'Editor';

-- Member + Viewer: read-only on sites, pages and news
INSERT OR IGNORE INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId")
SELECT lower(hex(randomblob(12))), role."tenantId", role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
WHERE role."isSystem" = 1
  AND permission."key" IN ('sites.view', 'pages.view', 'news.view')
  AND role."name" IN ('Member', 'Viewer');
