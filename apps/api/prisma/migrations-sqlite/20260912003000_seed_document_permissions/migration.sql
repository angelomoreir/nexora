INSERT OR IGNORE INTO "Permission" ("id", "key", "description") VALUES
  (lower(hex(randomblob(12))), 'documents.view', 'documents.view'),
  (lower(hex(randomblob(12))), 'documents.edit', 'documents.edit'),
  (lower(hex(randomblob(12))), 'documents.delete', 'documents.delete'),
  (lower(hex(randomblob(12))), 'documents.share', 'documents.share');

INSERT OR IGNORE INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId")
SELECT lower(hex(randomblob(12))), role."tenantId", role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
WHERE
  role."name" IN ('Super Admin', 'Admin')
  OR (role."name" = 'Manager' AND permission."key" IN ('documents.view', 'documents.edit', 'documents.delete', 'documents.share'))
  OR (role."name" = 'Editor' AND permission."key" IN ('documents.view', 'documents.edit', 'documents.delete'))
  OR (role."name" = 'Member' AND permission."key" IN ('documents.view', 'documents.edit'))
  OR (role."name" = 'Viewer' AND permission."key" = 'documents.view');

INSERT INTO "Folder" ("id", "tenantId", "parentId", "name", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(12))), tenant."id", NULL, 'Documentos', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" tenant
WHERE NOT EXISTS (
  SELECT 1 FROM "Folder" folder
  WHERE folder."tenantId" = tenant."id" AND folder."parentId" IS NULL AND folder."name" = 'Documentos'
);

INSERT OR IGNORE INTO "Folder" ("id", "tenantId", "parentId", "name", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(12))), root."tenantId", root."id", category."name", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Folder" root
CROSS JOIN (SELECT 'Contratos' AS "name" UNION ALL SELECT 'Faturas' UNION ALL SELECT 'Projetos') category
WHERE root."parentId" IS NULL AND root."name" = 'Documentos';
