// One-off data pump: copies every row from the legacy SQLite dev.db into the
// PostgreSQL database pointed at by DATABASE_URL. Idempotent via skipDuplicates.
import { PrismaClient as PgClient } from "@prisma/client";
import sqlitePkg from "../prisma-sqlite/client/index.js";

const { PrismaClient: SqliteClient } = sqlitePkg;

const sqlite = new SqliteClient();
const pg = new PgClient();

const models = Object.keys(sqlite).filter(
  (key) => !key.startsWith("$") && !key.startsWith("_") && typeof sqlite[key]?.findMany === "function"
);

let totalRows = 0;
let totalInserted = 0;

try {
  await pg.$executeRawUnsafe("SET session_replication_role = 'replica'");
  for (const model of models) {
    const rows = await sqlite[model].findMany();
    totalRows += rows.length;
    if (rows.length === 0) {
      console.log(`${model}: 0 rows`);
      continue;
    }
    const result = await pg[model].createMany({ data: rows, skipDuplicates: true });
    totalInserted += result.count;
    console.log(`${model}: ${result.count}/${rows.length} inserted`);
  }
} finally {
  await pg.$executeRawUnsafe("SET session_replication_role = 'origin'").catch(() => {});
  await sqlite.$disconnect();
  await pg.$disconnect();
}

console.log(`\nDONE: ${totalInserted}/${totalRows} rows inserted (duplicates skipped)`);
