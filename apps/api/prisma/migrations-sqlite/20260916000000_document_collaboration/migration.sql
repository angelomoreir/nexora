-- Document collaboration: recycle bin, comments, check-out, folder metadata, content search

-- AlterTable: Document
ALTER TABLE "Document" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Document" ADD COLUMN "deletedByMembershipId" TEXT REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD COLUMN "deletedViaFolderId" TEXT;
ALTER TABLE "Document" ADD COLUMN "checkedOutByMembershipId" TEXT REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD COLUMN "checkedOutAt" DATETIME;
ALTER TABLE "Document" ADD COLUMN "metadataJson" TEXT NOT NULL DEFAULT '{}';

-- AlterTable: Folder
ALTER TABLE "Folder" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Folder" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Folder" ADD COLUMN "deletedByMembershipId" TEXT REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Folder" ADD COLUMN "deletedViaFolderId" TEXT;

-- AlterTable: OrganizationSettings
ALTER TABLE "OrganizationSettings" ADD COLUMN "trashRetentionDays" INTEGER NOT NULL DEFAULT 30;

-- A trashed folder must not block creating a same-named folder: drop the unique index
DROP INDEX IF EXISTS "Folder_tenantId_parentId_name_key";
CREATE INDEX "Folder_tenantId_parentId_name_idx" ON "Folder"("tenantId", "parentId", "name");
CREATE INDEX "Folder_tenantId_status_idx" ON "Folder"("tenantId", "status");

-- CreateTable: DocumentComment
CREATE TABLE "DocumentComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentComment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "DocumentComment_tenantId_documentId_idx" ON "DocumentComment"("tenantId", "documentId");

-- CreateTable: FolderMetadataField
CREATE TABLE "FolderMetadataField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "optionsJson" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FolderMetadataField_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FolderMetadataField_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FolderMetadataField_folderId_slug_key" ON "FolderMetadataField"("folderId", "slug");
CREATE INDEX "FolderMetadataField_tenantId_folderId_idx" ON "FolderMetadataField"("tenantId", "folderId");

-- CreateTable: DocumentContent
CREATE TABLE "DocumentContent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "extractedAt" DATETIME NOT NULL,
    "versionId" TEXT,
    CONSTRAINT "DocumentContent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentContent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DocumentContent_documentId_key" ON "DocumentContent"("documentId");
CREATE INDEX "DocumentContent_tenantId_documentId_idx" ON "DocumentContent"("tenantId", "documentId");

-- Indexes for trash lookups
CREATE INDEX "Document_tenantId_deletedViaFolderId_idx" ON "Document"("tenantId", "deletedViaFolderId");
CREATE INDEX "Folder_tenantId_deletedViaFolderId_idx" ON "Folder"("tenantId", "deletedViaFolderId");
