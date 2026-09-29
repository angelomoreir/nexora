/*
  Warnings:

  - You are about to drop the column `schemaJson` on the `ListDefinition` table. All the data in the column will be lost.
  - Added the required column `createdById` to the `ListDefinition` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "ListField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "listDefinitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "optionsJson" TEXT,
    "relationListId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListField_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListField_listDefinitionId_fkey" FOREIGN KEY ("listDefinitionId") REFERENCES "ListDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListField_relationListId_fkey" FOREIGN KEY ("relationListId") REFERENCES "ListDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ListDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ListDefinition" ("createdAt", "id", "name", "tenantId", "updatedAt") SELECT "createdAt", "id", "name", "tenantId", "updatedAt" FROM "ListDefinition";
DROP TABLE "ListDefinition";
ALTER TABLE "new_ListDefinition" RENAME TO "ListDefinition";
CREATE INDEX "ListDefinition_tenantId_idx" ON "ListDefinition"("tenantId");
CREATE UNIQUE INDEX "ListDefinition_tenantId_name_key" ON "ListDefinition"("tenantId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ListField_tenantId_listDefinitionId_idx" ON "ListField"("tenantId", "listDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "ListField_listDefinitionId_slug_key" ON "ListField"("listDefinitionId", "slug");
