/*
  Warnings:

  - Added the required column `createdById` to the `FormDefinition` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FormDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schemaJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_FormDefinition" ("createdAt", "id", "name", "schemaJson", "status", "tenantId", "updatedAt") SELECT "createdAt", "id", "name", "schemaJson", "status", "tenantId", "updatedAt" FROM "FormDefinition";
DROP TABLE "FormDefinition";
ALTER TABLE "new_FormDefinition" RENAME TO "FormDefinition";
CREATE INDEX "FormDefinition_tenantId_status_idx" ON "FormDefinition"("tenantId", "status");
CREATE UNIQUE INDEX "FormDefinition_tenantId_name_key" ON "FormDefinition"("tenantId", "name");
CREATE TABLE "new_FormSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "formDefinitionId" TEXT NOT NULL,
    "valuesJson" TEXT NOT NULL,
    "submittedById" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormSubmission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormSubmission_formDefinitionId_fkey" FOREIGN KEY ("formDefinitionId") REFERENCES "FormDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FormSubmission" ("formDefinitionId", "id", "submittedAt", "submittedById", "tenantId", "valuesJson") SELECT "formDefinitionId", "id", "submittedAt", "submittedById", "tenantId", "valuesJson" FROM "FormSubmission";
DROP TABLE "FormSubmission";
ALTER TABLE "new_FormSubmission" RENAME TO "FormSubmission";
CREATE INDEX "FormSubmission_tenantId_formDefinitionId_idx" ON "FormSubmission"("tenantId", "formDefinitionId");
CREATE TABLE "new_ListItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "listDefinitionId" TEXT NOT NULL,
    "valuesJson" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListItem_listDefinitionId_fkey" FOREIGN KEY ("listDefinitionId") REFERENCES "ListDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ListItem" ("createdAt", "createdById", "id", "listDefinitionId", "tenantId", "updatedAt", "valuesJson") SELECT "createdAt", "createdById", "id", "listDefinitionId", "tenantId", "updatedAt", "valuesJson" FROM "ListItem";
DROP TABLE "ListItem";
ALTER TABLE "new_ListItem" RENAME TO "ListItem";
CREATE INDEX "ListItem_tenantId_listDefinitionId_idx" ON "ListItem"("tenantId", "listDefinitionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
