// Fixes dangling RolePermission.permissionId after the SQLite→PG port.
// Old Permission rows were skipped on conflict (same key, new uuid id), so
// ported RolePermissions reference ids that no longer exist. Remap by key.
import { PrismaClient as PgClient } from "@prisma/client";
import sqlitePkg from "../prisma-sqlite/client/index.js";

const { PrismaClient: SqliteClient } = sqlitePkg;

const sqlite = new SqliteClient();
const pg = new PgClient();

const oldPerms = await sqlite.permission.findMany({ select: { id: true, key: true } });
const oldIdToKey = new Map(oldPerms.map((p) => [p.id, p.key]));

const pgPerms = await pg.permission.findMany({ select: { id: true, key: true } });
const pgKeyToId = new Map(pgPerms.map((p) => [p.key, p.key && p.id]));
const pgPermIds = new Set(pgPerms.map((p) => p.id));

const allRp = await pg.rolePermission.findMany({ select: { id: true, roleId: true, permissionId: true } });
const dangling = allRp.filter((rp) => !pgPermIds.has(rp.permissionId));

let remapped = 0;
let removedDup = 0;
let unresolvable = 0;

for (const rp of dangling) {
  const key = oldIdToKey.get(rp.permissionId);
  const newId = key ? pgKeyToId.get(key) : undefined;
  if (!newId) {
    unresolvable++;
    console.log(`UNRESOLVED rp=${rp.id} oldPerm=${rp.permissionId} key=${key ?? "?"}`);
    continue;
  }
  const exists = allRp.some((other) => other.id !== rp.id && other.roleId === rp.roleId && other.permissionId === newId);
  if (exists) {
    await pg.rolePermission.delete({ where: { id: rp.id } });
    removedDup++;
  } else {
    await pg.rolePermission.update({ where: { id: rp.id }, data: { permissionId: newId } });
    remapped++;
    rp.permissionId = newId;
  }
}

console.log(`\ndangling: ${dangling.length} | remapped: ${remapped} | removed dup: ${removedDup} | unresolved: ${unresolvable}`);

await sqlite.$disconnect();
await pg.$disconnect();
