-- DropIndex
DROP INDEX "Approval_delegatedById_idx";

-- DropIndex
DROP INDEX "ApprovalComment_authorId_idx";

-- DropIndex
DROP INDEX "ApprovalDelegation_toMemberId_idx";

-- DropIndex
DROP INDEX "ApprovalDelegation_fromMemberId_idx";

-- DropIndex
DROP INDEX "AuditLog_actorId_idx";

-- DropIndex
DROP INDEX "AuditLog_tenantId_result_occurredAt_idx";

-- DropIndex
DROP INDEX "Document_tenantId_deletedViaFolderId_idx";

-- DropIndex
DROP INDEX "Document_createdById_idx";

-- DropIndex
DROP INDEX "Document_tenantId_status_idx";

-- DropIndex
DROP INDEX "DocumentOrganizationPermission_tenantId_documentId_idx";

-- DropIndex
DROP INDEX "DocumentVersion_createdById_idx";

-- DropIndex
DROP INDEX "FormSubmission_submittedById_idx";

-- DropIndex
DROP INDEX "ListField_relationListId_idx";

-- DropIndex
DROP INDEX "ListItem_createdById_idx";

-- DropIndex
DROP INDEX "ListItem_tenantId_listDefinitionId_createdAt_idx";

-- DropIndex
DROP INDEX "Project_createdById_idx";

-- DropIndex
DROP INDEX "TaskComment_authorId_idx";

-- DropIndex
DROP INDEX "WorkflowInstance_startedById_idx";

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'TEAM',
    "icon" TEXT NOT NULL DEFAULT 'folder',
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "visibility" TEXT NOT NULL DEFAULT 'ORG',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Site_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Site_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Site_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SiteMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SiteMember_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SiteMember_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SitePage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "widgetsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isHome" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SitePage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SitePage_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SitePage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NewsPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "coverColor" TEXT NOT NULL DEFAULT '#6366f1',
    "category" TEXT,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "authorMembershipId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NewsPost_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NewsPost_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NewsPost_authorMembershipId_fkey" FOREIGN KEY ("authorMembershipId") REFERENCES "Membership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NewsComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "newsId" TEXT NOT NULL,
    "authorMembershipId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NewsComment_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "NewsPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NewsComment_authorMembershipId_fkey" FOREIGN KEY ("authorMembershipId") REFERENCES "Membership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AIConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nova conversa',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AIConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AIConversation" ("createdAt", "id", "tenantId", "title", "updatedAt", "userId") SELECT "createdAt", "id", "tenantId", "title", "updatedAt", "userId" FROM "AIConversation";
DROP TABLE "AIConversation";
ALTER TABLE "new_AIConversation" RENAME TO "AIConversation";
CREATE INDEX "AIConversation_tenantId_userId_idx" ON "AIConversation"("tenantId", "userId");
CREATE TABLE "new_AIMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "actionType" TEXT,
    "actionData" TEXT,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AIMessage" ("actionData", "actionType", "content", "conversationId", "costUsd", "createdAt", "id", "role", "tokensUsed") SELECT "actionData", "actionType", "content", "conversationId", "costUsd", "createdAt", "id", "role", "tokensUsed" FROM "AIMessage";
DROP TABLE "AIMessage";
ALTER TABLE "new_AIMessage" RENAME TO "AIMessage";
CREATE INDEX "AIMessage_conversationId_idx" ON "AIMessage"("conversationId");
CREATE TABLE "new_AIOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "model" TEXT NOT NULL DEFAULT 'rule-based',
    "tokensInput" INTEGER NOT NULL DEFAULT 0,
    "tokensOutput" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AIOperation" ("costUsd", "createdAt", "durationMs", "errorMessage", "id", "model", "operation", "provider", "success", "tenantId", "tokensInput", "tokensOutput", "userId") SELECT "costUsd", "createdAt", "durationMs", "errorMessage", "id", "model", "operation", "provider", "success", "tenantId", "tokensInput", "tokensOutput", "userId" FROM "AIOperation";
DROP TABLE "AIOperation";
ALTER TABLE "new_AIOperation" RENAME TO "AIOperation";
CREATE INDEX "AIOperation_tenantId_createdAt_idx" ON "AIOperation"("tenantId", "createdAt");
CREATE TABLE "new_Folder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" DATETIME,
    "deletedByMembershipId" TEXT,
    "deletedViaFolderId" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" DATETIME,
    "inheritsPermissions" BOOLEAN NOT NULL DEFAULT true,
    "retentionMode" TEXT NOT NULL DEFAULT 'NONE',
    "retentionDays" INTEGER,
    "sensitivity" TEXT NOT NULL DEFAULT 'INTERNAL',
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "siteId" TEXT,
    CONSTRAINT "Folder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Folder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Folder_deletedByMembershipId_fkey" FOREIGN KEY ("deletedByMembershipId") REFERENCES "Membership" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Folder_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Folder" ("createdAt", "createdById", "deletedAt", "deletedByMembershipId", "deletedViaFolderId", "id", "inheritsPermissions", "isTemplate", "name", "parentId", "pinnedAt", "requireApproval", "retentionDays", "retentionMode", "sensitivity", "status", "tenantId", "updatedAt") SELECT "createdAt", "createdById", "deletedAt", "deletedByMembershipId", "deletedViaFolderId", "id", "inheritsPermissions", "isTemplate", "name", "parentId", "pinnedAt", "requireApproval", "retentionDays", "retentionMode", "sensitivity", "status", "tenantId", "updatedAt" FROM "Folder";
DROP TABLE "Folder";
ALTER TABLE "new_Folder" RENAME TO "Folder";
CREATE INDEX "Folder_tenantId_parentId_name_idx" ON "Folder"("tenantId", "parentId", "name");
CREATE INDEX "Folder_tenantId_parentId_idx" ON "Folder"("tenantId", "parentId");
CREATE INDEX "Folder_tenantId_status_idx" ON "Folder"("tenantId", "status");
CREATE TABLE "new_FormDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schemaJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FormDefinition_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FormDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_FormDefinition" ("createdAt", "createdById", "description", "id", "name", "schemaJson", "status", "tenantId", "updatedAt") SELECT "createdAt", "createdById", "description", "id", "name", "schemaJson", "status", "tenantId", "updatedAt" FROM "FormDefinition";
DROP TABLE "FormDefinition";
ALTER TABLE "new_FormDefinition" RENAME TO "FormDefinition";
CREATE INDEX "FormDefinition_tenantId_status_idx" ON "FormDefinition"("tenantId", "status");
CREATE UNIQUE INDEX "FormDefinition_tenantId_name_key" ON "FormDefinition"("tenantId", "name");
CREATE TABLE "new_ListDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListDefinition_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ListDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ListDefinition" ("createdAt", "createdById", "description", "icon", "id", "name", "tenantId", "updatedAt") SELECT "createdAt", "createdById", "description", "icon", "id", "name", "tenantId", "updatedAt" FROM "ListDefinition";
DROP TABLE "ListDefinition";
ALTER TABLE "new_ListDefinition" RENAME TO "ListDefinition";
CREATE INDEX "ListDefinition_tenantId_idx" ON "ListDefinition"("tenantId");
CREATE UNIQUE INDEX "ListDefinition_tenantId_name_key" ON "ListDefinition"("tenantId", "name");
CREATE TABLE "new_OrganizationSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "language" TEXT NOT NULL DEFAULT 'pt-PT',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Lisbon',
    "passwordMinLength" INTEGER NOT NULL DEFAULT 8,
    "passwordRequireUpper" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireLower" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireDigit" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireSymbol" BOOLEAN NOT NULL DEFAULT false,
    "storageQuotaBytes" BIGINT NOT NULL DEFAULT 10737418240,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT false,
    "trashRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrganizationSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OrganizationSettings" ("createdAt", "emailNotifications", "id", "language", "logoUrl", "notificationsEnabled", "passwordMinLength", "passwordRequireDigit", "passwordRequireLower", "passwordRequireSymbol", "passwordRequireUpper", "storageQuotaBytes", "tenantId", "timezone", "trashRetentionDays", "updatedAt") SELECT "createdAt", "emailNotifications", "id", "language", "logoUrl", "notificationsEnabled", "passwordMinLength", "passwordRequireDigit", "passwordRequireLower", "passwordRequireSymbol", "passwordRequireUpper", "storageQuotaBytes", "tenantId", "timezone", "trashRetentionDays", "updatedAt" FROM "OrganizationSettings";
DROP TABLE "OrganizationSettings";
ALTER TABLE "new_OrganizationSettings" RENAME TO "OrganizationSettings";
CREATE UNIQUE INDEX "OrganizationSettings_tenantId_key" ON "OrganizationSettings"("tenantId");
CREATE INDEX "OrganizationSettings_tenantId_idx" ON "OrganizationSettings"("tenantId");
CREATE TABLE "new_OrganizationSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "trialEndsAt" DATETIME,
    "currentPeriodStart" DATETIME,
    "currentPeriodEnd" DATETIME,
    "canceledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrganizationSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganizationSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrganizationSubscription" ("billingCycle", "canceledAt", "createdAt", "currentPeriodEnd", "currentPeriodStart", "id", "planId", "status", "stripeCustomerId", "stripePriceId", "stripeSubscriptionId", "tenantId", "trialEndsAt", "updatedAt") SELECT "billingCycle", "canceledAt", "createdAt", "currentPeriodEnd", "currentPeriodStart", "id", "planId", "status", "stripeCustomerId", "stripePriceId", "stripeSubscriptionId", "tenantId", "trialEndsAt", "updatedAt" FROM "OrganizationSubscription";
DROP TABLE "OrganizationSubscription";
ALTER TABLE "new_OrganizationSubscription" RENAME TO "OrganizationSubscription";
CREATE UNIQUE INDEX "OrganizationSubscription_tenantId_key" ON "OrganizationSubscription"("tenantId");
CREATE INDEX "OrganizationSubscription_planId_idx" ON "OrganizationSubscription"("planId");
CREATE INDEX "OrganizationSubscription_status_idx" ON "OrganizationSubscription"("status");
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "startAt" DATETIME,
    "dueAt" DATETIME,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "assignedMembershipId" TEXT,
    "assignedTeamId" TEXT,
    "projectId" TEXT,
    "documentId" TEXT,
    "siteId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_assignedMembershipId_fkey" FOREIGN KEY ("assignedMembershipId") REFERENCES "Membership" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("assignedMembershipId", "assignedTeamId", "createdAt", "createdById", "description", "documentId", "dueAt", "id", "priority", "projectId", "startAt", "status", "tagsJson", "tenantId", "title", "updatedAt") SELECT "assignedMembershipId", "assignedTeamId", "createdAt", "createdById", "description", "documentId", "dueAt", "id", "priority", "projectId", "startAt", "status", "tagsJson", "tenantId", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_tenantId_status_idx" ON "Task"("tenantId", "status");
CREATE INDEX "Task_tenantId_assignedMembershipId_idx" ON "Task"("tenantId", "assignedMembershipId");
CREATE INDEX "Task_tenantId_assignedTeamId_idx" ON "Task"("tenantId", "assignedTeamId");
CREATE INDEX "Task_tenantId_projectId_idx" ON "Task"("tenantId", "projectId");
CREATE INDEX "Task_tenantId_dueAt_idx" ON "Task"("tenantId", "dueAt");
CREATE TABLE "new_WorkflowDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT,
    "processDefinitionId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "definitionJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkflowDefinition_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkflowDefinition_processDefinitionId_fkey" FOREIGN KEY ("processDefinitionId") REFERENCES "ProcessDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WorkflowDefinition" ("createdAt", "createdById", "definitionJson", "description", "id", "name", "processDefinitionId", "status", "tenantId", "updatedAt", "version") SELECT "createdAt", "createdById", "definitionJson", "description", "id", "name", "processDefinitionId", "status", "tenantId", "updatedAt", "version" FROM "WorkflowDefinition";
DROP TABLE "WorkflowDefinition";
ALTER TABLE "new_WorkflowDefinition" RENAME TO "WorkflowDefinition";
CREATE INDEX "WorkflowDefinition_tenantId_status_idx" ON "WorkflowDefinition"("tenantId", "status");
CREATE UNIQUE INDEX "WorkflowDefinition_tenantId_name_version_key" ON "WorkflowDefinition"("tenantId", "name", "version");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Site_tenantId_parentId_idx" ON "Site"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Site_tenantId_slug_key" ON "Site"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "SiteMember_tenantId_membershipId_idx" ON "SiteMember"("tenantId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteMember_siteId_membershipId_key" ON "SiteMember"("siteId", "membershipId");

-- CreateIndex
CREATE INDEX "SitePage_tenantId_siteId_idx" ON "SitePage"("tenantId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SitePage_siteId_slug_key" ON "SitePage"("siteId", "slug");

-- CreateIndex
CREATE INDEX "NewsPost_tenantId_status_publishedAt_idx" ON "NewsPost"("tenantId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "NewsPost_tenantId_siteId_idx" ON "NewsPost"("tenantId", "siteId");

-- CreateIndex
CREATE INDEX "NewsComment_tenantId_newsId_idx" ON "NewsComment"("tenantId", "newsId");


-- Preserve hand-added performance indexes dropped by table rebuilds above
CREATE INDEX IF NOT EXISTS "Approval_delegatedById_idx" ON "Approval"("delegatedById");
CREATE INDEX IF NOT EXISTS "ApprovalComment_authorId_idx" ON "ApprovalComment"("authorId");
CREATE INDEX IF NOT EXISTS "ApprovalDelegation_toMemberId_idx" ON "ApprovalDelegation"("toMemberId");
CREATE INDEX IF NOT EXISTS "ApprovalDelegation_fromMemberId_idx" ON "ApprovalDelegation"("fromMemberId");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_result_occurredAt_idx" ON "AuditLog"("tenantId", "result", "occurredAt");
CREATE INDEX IF NOT EXISTS "Document_tenantId_deletedViaFolderId_idx" ON "Document"("tenantId", "deletedViaFolderId");
CREATE INDEX IF NOT EXISTS "Document_createdById_idx" ON "Document"("createdById");
CREATE INDEX IF NOT EXISTS "Document_tenantId_status_idx" ON "Document"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "DocumentOrganizationPermission_tenantId_documentId_idx" ON "DocumentOrganizationPermission"("tenantId", "documentId");
CREATE INDEX IF NOT EXISTS "DocumentVersion_createdById_idx" ON "DocumentVersion"("createdById");
CREATE INDEX IF NOT EXISTS "FormSubmission_submittedById_idx" ON "FormSubmission"("submittedById");
CREATE INDEX IF NOT EXISTS "ListField_relationListId_idx" ON "ListField"("relationListId");
CREATE INDEX IF NOT EXISTS "ListItem_createdById_idx" ON "ListItem"("createdById");
CREATE INDEX IF NOT EXISTS "ListItem_tenantId_listDefinitionId_createdAt_idx" ON "ListItem"("tenantId", "listDefinitionId", "createdAt");
CREATE INDEX IF NOT EXISTS "Project_createdById_idx" ON "Project"("createdById");
CREATE INDEX IF NOT EXISTS "TaskComment_authorId_idx" ON "TaskComment"("authorId");
CREATE INDEX IF NOT EXISTS "WorkflowInstance_startedById_idx" ON "WorkflowInstance"("startedById");

-- Indexes for the new siteId foreign keys
CREATE INDEX IF NOT EXISTS "Folder_siteId_idx" ON "Folder"("siteId");
CREATE INDEX IF NOT EXISTS "ListDefinition_siteId_idx" ON "ListDefinition"("siteId");
CREATE INDEX IF NOT EXISTS "FormDefinition_siteId_idx" ON "FormDefinition"("siteId");
CREATE INDEX IF NOT EXISTS "WorkflowDefinition_siteId_idx" ON "WorkflowDefinition"("siteId");
CREATE INDEX IF NOT EXISTS "Task_siteId_idx" ON "Task"("siteId");
