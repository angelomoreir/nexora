-- The system Editor role must not hold sites.manage: that capability grants
-- implicit ADMIN on every site (including PRIVATE ones). Revoke it from
-- existing organizations; new organizations no longer receive it.
DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."isSystem" = true
  AND r."name" = 'Editor'
  AND p."key" = 'sites.manage';
