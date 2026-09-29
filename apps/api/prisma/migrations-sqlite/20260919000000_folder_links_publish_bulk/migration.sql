-- Folder share links + file requests (DocumentShareLink.folderId, permission UPLOAD),
-- major/minor versioning + content approval (Document.publishStatus, DocumentVersion.versionType,
-- Folder.requireApproval).

-- Folder: content approval flag
ALTER TABLE "Folder" ADD COLUMN "requireApproval" BOOLEAN NOT NULL DEFAULT false;

-- Document: publish workflow state
ALTER TABLE "Document" ADD COLUMN "publishStatus" TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "Document" ADD COLUMN "publishRequestedById" TEXT REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD COLUMN "publishRequestedAt" DATETIME;

-- DocumentVersion: major/minor type
ALTER TABLE "DocumentVersion" ADD COLUMN "versionType" TEXT NOT NULL DEFAULT 'MAJOR';

-- DocumentShareLink: folder links + nullable documentId (table rebuild)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_DocumentShareLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT,
    "folderId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "passwordHash" TEXT,
    "permission" TEXT NOT NULL DEFAULT 'READ',
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentShareLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentShareLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentShareLink_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DocumentShareLink" ("id", "tenantId", "documentId", "tokenHash", "passwordHash", "permission", "expiresAt", "revokedAt", "createdById", "createdAt")
SELECT "id", "tenantId", "documentId", "tokenHash", "passwordHash", "permission", "expiresAt", "revokedAt", "createdById", "createdAt" FROM "DocumentShareLink";
DROP TABLE "DocumentShareLink";
ALTER TABLE "new_DocumentShareLink" RENAME TO "DocumentShareLink";
CREATE UNIQUE INDEX "DocumentShareLink_tokenHash_key" ON "DocumentShareLink"("tokenHash");
CREATE INDEX "DocumentShareLink_tenantId_documentId_idx" ON "DocumentShareLink"("tenantId", "documentId");
CREATE INDEX "DocumentShareLink_tenantId_folderId_idx" ON "DocumentShareLink"("tenantId", "folderId");
CREATE INDEX "DocumentShareLink_expiresAt_revokedAt_idx" ON "DocumentShareLink"("expiresAt", "revokedAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
